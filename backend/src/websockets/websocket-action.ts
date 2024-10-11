import { WebSocket } from 'ws'
import { eq, and, gt } from 'drizzle-orm'
import { isEqual } from 'lodash'
import { match, P } from 'ts-pattern'

import { ClientMessage } from 'common/websockets/websocket-schema'
import { mainPrompt } from '../main-prompt'
import { ClientAction, ServerAction } from 'common/actions'
import { sendMessage } from './server'
import { getSearchSystemPrompt } from '../system-prompt'
import { promptClaude } from '../claude'
import { env } from '../env.mjs'
import db from 'common/db'
import { genAuthCode } from 'common/util/credentials'
import * as schema from 'common/db/schema'
import { claudeModels } from 'common/constants'
import { protec } from './middleware'
import { getQuotaManager } from '@/billing/quota-manager'
import { logger, withLoggerContext } from '@/util/logger'
import { generateCommitMessage } from '@/generate-commit-message'
import { hasMaxedReferrals } from 'common/util/server/referral'

export const sendAction = (ws: WebSocket, action: ServerAction) => {
  sendMessage(ws, {
    type: 'action',
    data: action,
  })
}

export const getUserIdFromAuthToken = async (
  authToken?: string
): Promise<string | undefined> => {
  if (!authToken) return undefined

  const userId = await db
    .select({ userId: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .then((users) => {
      if (users.length === 1) {
        return users[0].userId
      }
      return undefined
    })

  return userId
}

async function calculateUsage(fingerprintId: string, userId?: string) {
  const quotaManager = getQuotaManager(
    userId ? 'authenticated' : 'anonymous',
    userId ?? fingerprintId
  )
  const { creditsUsed, quota } = await quotaManager.checkQuota()
  return { usage: creditsUsed, limit: quota }
}

const onUserInput = async (
  {
    fingerprintId,
    authToken,
    userInputId,
    messages,
    fileContext,
    previousChanges,
  }: Extract<ClientAction, { type: 'user-input' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  await withLoggerContext(
    { fingerprintId, authToken, clientRequestId: userInputId },
    async () => {
      const lastMessage = messages[messages.length - 1]
      if (typeof lastMessage.content === 'string') {
        logger.info(`USER INPUT: ${lastMessage.content}`)
      }

      const userId = await getUserIdFromAuthToken(authToken)
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
            }),
          userId
        )

        logger.debug({ response, changes, toolCall }, 'response-complete')

        if (toolCall) {
          sendAction(ws, {
            type: 'tool-call',
            userInputId,
            response,
            data: toolCall,
            changes,
          })
        } else {
          const { usage, limit } = await calculateUsage(fingerprintId, userId)
          sendAction(ws, {
            type: 'response-complete',
            userInputId,
            response,
            changes,
            usage,
            limit,
          })
        }
      } catch (e) {
        logger.error(e, 'Error in mainPrompt')
        const response =
          e && typeof e === 'object' && 'message' in e
            ? `\n\nError: ${e.message}`
            : ''
        sendAction(ws, {
          type: 'response-chunk',
          userInputId,
          chunk: response,
        })
        setTimeout(async () => {
          sendAction(ws, {
            type: 'response-complete',
            userInputId,
            response,
            changes: [],
          })
        }, 100)
      }
    }
  )
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
  await withLoggerContext(
    { fingerprintId, userId, authToken, fingerprintHash },
    async () => {
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
        logger.info('Cleared auth token')
      } else {
        logger.info('No auth token to clear, possible attack?')
      }
    }
  )
}

const onLoginCodeRequest = (
  {
    fingerprintId,
    referralCode,
  }: Extract<ClientAction, { type: 'login-code-request' }>,
  _clientSessionId: string,
  ws: WebSocket
): void => {
  withLoggerContext({ fingerprintId }, async () => {
    const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes in the future
    const fingerprintHash = genAuthCode(
      fingerprintId,
      expiresAt.toString(),
      env.NEXTAUTH_SECRET
    )
    const loginUrl = `${env.NEXT_PUBLIC_APP_URL}/login?auth_code=${fingerprintId}.${expiresAt}.${fingerprintHash}${referralCode ? `&referral_code=${referralCode}` : ''}`

    sendAction(ws, {
      type: 'login-code-response',
      fingerprintId,
      fingerprintHash,
      loginUrl,
    })
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
  await withLoggerContext({ fingerprintId, fingerprintHash }, async () => {
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
      logger.error(e, 'Error in login status request')
      sendAction(ws, {
        type: 'auth-result',
        user: undefined,
        message: error.message,
      })
    }
  })
}

const onInit = async (
  {
    fileContext,
    fingerprintId,
    authToken,
  }: Extract<ClientAction, { type: 'init' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  await withLoggerContext({ fingerprintId, authToken }, async () => {
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
    const userId = await getUserIdFromAuthToken(authToken)
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
        userId,
        userInputId: 'init-cache',
        maxTokens: 1,
      }
    )
    logger.info(`Warming context cache done in ${Date.now() - startTime}ms`)
    sendAction(ws, {
      type: 'init-response',
    })
  })
}

const onUsageRequest = async (
  { fingerprintId, authToken }: Extract<ClientAction, { type: 'usage' }>,
  _clientSessionId: string,
  ws: WebSocket
) => {
  const userId = await getUserIdFromAuthToken(authToken)
  const { usage, limit } = await calculateUsage(fingerprintId, userId)
  await withLoggerContext({ fingerprintId, userId, usage, limit }, async () => {
    logger.info('Sending usage info')

    let referralLink: string | undefined = undefined
    if (userId) {
      const shouldGenerateReferralLink = await hasMaxedReferrals(userId)
      if (shouldGenerateReferralLink.reason === undefined) {
        referralLink = shouldGenerateReferralLink.referralLink
      }
    }

    sendAction(ws, {
      type: 'usage-response',
      usage,
      limit,
      referralLink,
    })
  })
}

const onGenerateCommitMessage = async (
  {
    fingerprintId,
    authToken,
    stagedChanges,
  }: Extract<ClientAction, { type: 'generate-commit-message' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  await withLoggerContext({ fingerprintId, authToken }, async () => {
    const userId = await getUserIdFromAuthToken(authToken)
    try {
      const commitMessage = await generateCommitMessage(
        stagedChanges,
        clientSessionId,
        fingerprintId,
        userId
      )
      logger.info(`Generated commit message: ${commitMessage}`)
      sendAction(ws, {
        type: 'commit-message-response',
        commitMessage,
      })
    } catch (e) {
      logger.error(e, 'Error generating commit message')
      sendAction(ws, {
        type: 'commit-message-response',
        commitMessage: 'Error generating commit message',
      })
    }
  })
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
  await withLoggerContext({ clientSessionId }, async () => {
    const callbacks = callbacksByAction[msg.data.type] ?? []
    try {
      await Promise.all(
        callbacks.map((cb) => cb(msg.data, clientSessionId, ws))
      )
    } catch (e) {
      logger.error(
        {
          message: msg,
          error: e && typeof e === 'object' && 'message' in e ? e.message : e,
        },
        'Got error running subscribeToAction callback'
      )
    }
  })
}

subscribeToAction('user-input', () => protec.run(onUserInput))
subscribeToAction('init', () => protec.run(onInit))

subscribeToAction('clear-auth-token', onClearAuthTokenRequest)
subscribeToAction('login-code-request', onLoginCodeRequest)

subscribeToAction('usage', onUsageRequest)
subscribeToAction('login-status-request', onLoginStatusRequest)

subscribeToAction(
  'generate-commit-message',
  protec.run(onGenerateCommitMessage)
)

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
