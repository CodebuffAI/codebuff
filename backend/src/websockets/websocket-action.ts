import { WebSocket } from 'ws'
import { ClientMessage } from 'common/websockets/websocket-schema'
import { mainPrompt } from '../main-prompt'
import { ClientAction, ServerAction } from 'common/actions'
import { sendMessage, SWITCHBOARD } from './server'
import { isEqual } from 'lodash'
import { getSearchSystemPrompt } from '../system-prompt'
import { promptClaude } from '../claude'
import { env } from '../env.mjs'
import db from 'common/src/db'
import * as schema from 'common/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { genAuthCode } from 'common/util/credentials'
import { match, P } from 'ts-pattern'
import { claudeModels } from 'common/constants'
import { WebSocketMiddleware } from './middleware'
import { checkQuota, limitFingerprint, resetQuota } from '@/billing/message'

const sendAction = (ws: WebSocket, action: ServerAction) => {
  sendMessage(ws, {
    type: 'action',
    data: action,
  })
}

const onUserInput = async (
  {
    fingerprintId,
    userInputId,
    messages,
    fileContext,
    previousChanges,
  }: Extract<ClientAction, { type: 'user-input' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  const lastMessage = messages[messages.length - 1]
  if (typeof lastMessage.content === 'string')
    console.log('Input:', lastMessage)

  try {
    const { toolCall, response, changes } = await mainPrompt(
      ws,
      messages,
      fileContext,
      clientSessionId,
      fingerprintId,
      userInputId,
      (chunk) =>
        sendAction(ws, {
          type: 'response-chunk',
          userInputId,
          chunk,
        })
    )
    const allChanges = [...previousChanges, ...changes]

    if (toolCall) {
      console.log('toolCall', toolCall.name, toolCall.input)
      sendAction(ws, {
        type: 'tool-call',
        userInputId,
        response,
        data: toolCall,
        changes: allChanges,
      })
    } else {
      console.log('response-complete')
      sendAction(ws, {
        type: 'response-complete',
        userInputId,
        response,
        changes: allChanges,
      })
    }
  } catch (e) {
    console.error('Error in mainPrompt', e)
    const response =
      e && typeof e === 'object' && 'message' in e
        ? `\n\nError: ${e.message}`
        : ''
    sendAction(ws, {
      type: 'response-chunk',
      userInputId,
      chunk: response,
    })
    setTimeout(() => {
      sendAction(ws, {
        type: 'response-complete',
        userInputId,
        response,
        changes: [],
      })
    }, 100)
  }
}

const onClearAuthTokenRequest = async (
  {
    authToken,
    userId,
    fingerprintId,
    fingerprintHash,
  }: Extract<ClientAction, { type: 'clear-auth-token' }>,
  _clientSessionId: string,
  _ws: WebSocket
) => {
  const validDeletion = await db
    .delete(schema.session)
    .where(
      and(
        eq(schema.session.sessionToken, authToken), // token exists
        eq(schema.session.userId, userId), // belongs to user
        gt(schema.session.expires, new Date()), // active session

        // probably not necessary, but just in case. paranoia > death
        eq(schema.session.fingerprint_id, fingerprintId)
      )
    )
    .returning({
      id: schema.session.sessionToken,
    })

  if (validDeletion.length > 0) {
    console.log('Cleared auth token', authToken)
  } else {
    console.log('No auth token to clear, possible attack?', {
      userId,
      authToken,
    })
  }
}

const onLoginCodeRequest = (
  { fingerprintId }: Extract<ClientAction, { type: 'login-code-request' }>,
  _clientSessionId: string,
  ws: WebSocket
): void => {
  const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes in the future
  const fingerprintHash = genAuthCode(
    fingerprintId,
    expiresAt.toString(),
    env.NEXTAUTH_SECRET
  )
  const loginUrl = `${env.APP_URL}/login?auth_code=${fingerprintId}.${expiresAt}.${fingerprintHash}`

  sendAction(ws, {
    type: 'login-code-response',
    fingerprintId,
    fingerprintHash,
    loginUrl,
  })
}

const onLoginStatusRequest = async (
  {
    fingerprintId,
    fingerprintHash,
  }: Extract<ClientAction, { type: 'login-status-request' }>,
  _clientSessionId: string,
  ws: WebSocket
) => {
  try {
    const users = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        authToken: schema.session.sessionToken,
      })
      .from(schema.user)
      .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
      .leftJoin(
        schema.fingerprint,
        eq(schema.session.fingerprint_id, schema.fingerprint.id)
      )
      .where(
        and(
          eq(schema.session.fingerprint_id, fingerprintId),
          eq(schema.fingerprint.sig_hash, fingerprintHash)
        )
      )

    match(users).with(
      P.array({
        id: P.string,
        name: P.string,
        email: P.string,
        authToken: P.string,
      }),
      (users) => {
        const user = users[0]
        if (!user) return
        sendAction(ws, {
          type: 'auth-result',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            authToken: user.authToken,
            fingerprintId,
            fingerprintHash,
          },
          message: 'Authentication successful!',
        })
      }
    )
  } catch (e) {
    const error = e as Error
    console.error('Error in login status request', e)
    sendAction(ws, {
      type: 'auth-result',
      user: undefined,
      message: error.message,
    })
  }
}

const onInit = async (
  { fileContext, fingerprintId }: Extract<ClientAction, { type: 'init' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  // Create a new session for fingerprint if it doesn't exist
  await db
    .insert(schema.fingerprint)
    .values({
      id: fingerprintId,
    })
    .onConflictDoNothing()

  // warm context cache
  const startTime = Date.now()
  const system = getSearchSystemPrompt(fileContext)
  await promptClaude(
    [
      {
        role: 'user',
        content: 'please respond with just a single word "manicode"',
      },
    ],
    {
      model: claudeModels.sonnet,
      system,
      clientSessionId,
      fingerprintId,
      userInputId: 'init-cache',
      maxTokens: 1,
    }
  )
  sendAction(ws, {
    type: 'init-response',
  })
  console.log('Warming context cache done', Date.now() - startTime)
}

const callbacksByAction = {} as Record<
  ClientAction['type'],
  ((action: ClientAction, clientSessionId: string, ws: WebSocket) => void)[]
>

export const subscribeToAction = <T extends ClientAction['type']>(
  type: T,
  callback: (
    action: Extract<ClientAction, { type: T }>,
    clientSessionId: string,
    ws: WebSocket
  ) => void
) => {
  callbacksByAction[type] = (callbacksByAction[type] ?? []).concat(
    callback as (
      action: ClientAction,
      clientSessionId: string,
      ws: WebSocket
    ) => void
  )
  return () => {
    callbacksByAction[type] = (callbacksByAction[type] ?? []).filter(
      (cb) => cb !== callback
    )
  }
}

export const onWebsocketAction = async (
  ws: WebSocket,
  clientSessionId: string,
  msg: ClientMessage & { type: 'action' }
) => {
  const callbacks = callbacksByAction[msg.data.type] ?? []
  try {
    await Promise.all(callbacks.map((cb) => cb(msg.data, clientSessionId, ws)))
  } catch (e) {
    console.error(
      'Got error running subscribeToAction callback',
      msg,
      e && typeof e === 'object' && 'message' in e ? e.message : e
    )
  }
}

const protec = new WebSocketMiddleware()
protec.use(async (action, _) => {
  console.log(
    `Protecting action of type: '${action.type}' (currently disabled)`
  )
})
// protec.use(async (action, ws) => {
//   const fingerprintId = match(action)
//     .with(
//       {
//         fingerprintId: P.string,
//       },
//       ({ fingerprintId }) => fingerprintId
//     )
//     .otherwise(() => null)

//   if (!fingerprintId) {
//     console.error('No fingerprintId found, cannot check quota')
//     throw new Error('No fingerprintId found')
//   }

//   const { creditsUsed, quota, userId, endDate } =
//     await checkQuota(fingerprintId)
//   if (creditsUsed >= quota) {
//     limitFingerprint(fingerprintId, userId)
//     sendAction(ws, {
//       type: 'usage',
//       usage: creditsUsed,
//       limit: quota,
//     })
//     throw new Error(
//       `Usage limit exceeded for user ${fingerprintId}: ${creditsUsed} >= ${quota}`
//     )
//   }

//   if (endDate < new Date()) {
//     // End date is in the past, so we should reset the quota
//     resetQuota(fingerprintId, userId)
//   }
// })

// subscribeToAction('user-input', protec.run(onUserInput))
// subscribeToAction('init', protec.run(onInit))
subscribeToAction('user-input', onUserInput)
subscribeToAction('init', onInit)

subscribeToAction('clear-auth-token', onClearAuthTokenRequest)
subscribeToAction('login-code-request', onLoginCodeRequest)
subscribeToAction('login-status-request', onLoginStatusRequest)

export async function requestFiles(ws: WebSocket, filePaths: string[]) {
  return new Promise<Record<string, string | null>>((resolve) => {
    const unsubscribe = subscribeToAction('read-files-response', (action) => {
      const receivedFilePaths = Object.keys(action.files)
      if (isEqual(receivedFilePaths, filePaths)) {
        unsubscribe()
        resolve(action.files)
      }
    })
    sendAction(ws, {
      type: 'read-files',
      filePaths,
    })
  })
}

export async function requestFile(ws: WebSocket, filePath: string) {
  const files = await requestFiles(ws, [filePath])
  return files[filePath]
}
