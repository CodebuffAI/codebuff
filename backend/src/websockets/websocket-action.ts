import { WebSocket } from 'ws'
import { ClientMessage } from 'common/websockets/websocket-schema'
import { mainPrompt } from '../main-prompt'
import { ClientAction, ServerAction } from 'common/actions'
import { sendMessage } from './server'
import { isEqual } from 'lodash'
import fs from 'fs'
import path from 'path'
import { getSearchSystemPrompt } from '../system-prompt'
import { promptClaude, models } from '../claude'
import { env } from '../env.mjs'
import db from 'common/src/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { genAuthCode } from 'common/util/credentials'
import { match, P } from 'ts-pattern'

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
      fingerprintId,
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

const onLoginCodeRequest = (
  { fingerprintId }: Extract<ClientAction, { type: 'login-code-request' }>,
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
  ws: WebSocket
) => {
  try {
    const users = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        authToken: schema.sessions.sessionToken,
        fingerprintId: schema.sessions.fingerprintId,
      })
      .from(schema.users)
      .leftJoin(schema.sessions, eq(schema.users.id, schema.sessions.userId))
      .where(
        and(
          eq(schema.sessions.fingerprintId, fingerprintId),
          eq(schema.sessions.fingerprintHash, fingerprintHash)
        )
      )

    match(users).with(
      P.array({
        authToken: P.string,
        fingerprintId: P.string,
      }),
      (users) => {
        const user = users[0]
        if (!user) return
        sendAction(ws, {
          type: 'auth-result',
          user,
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

const onCheckNpmVersion = async (
  { version }: Extract<ClientAction, { type: 'check-npm-version' }>,
  ws: WebSocket
) => {
  let latestVersion = version

  const backendPackageJsonPath = path.join(__dirname, '../../', 'package.json')
  const backendPackageJson = JSON.parse(
    fs.readFileSync(backendPackageJsonPath, 'utf-8')
  )
  latestVersion = backendPackageJson.version

  const isUpToDate = version === latestVersion
  console.log('npm version status', { clientVersion: version, latestVersion })

  sendAction(ws, {
    type: 'npm-version-status',
    isUpToDate,
    latestVersion,
  })
}

const onWarmContextCache = async (
  {
    fileContext,
    fingerprintId,
  }: Extract<ClientAction, { type: 'warm-context-cache' }>,
  ws: WebSocket
) => {
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
      model: models.sonnet,
      system,
      userId: fingerprintId,
    }
  )
  sendAction(ws, {
    type: 'warm-context-cache-response',
  })
  console.log('Warming context cache done', Date.now() - startTime)
}

const callbacksByAction = {} as Record<
  ClientAction['type'],
  ((action: ClientAction, ws: WebSocket) => void)[]
>

export const subscribeToAction = <T extends ClientAction['type']>(
  type: T,
  callback: (action: Extract<ClientAction, { type: T }>, ws: WebSocket) => void
) => {
  callbacksByAction[type] = (callbacksByAction[type] ?? []).concat(
    callback as (action: ClientAction, ws: WebSocket) => void
  )
  return () => {
    callbacksByAction[type] = (callbacksByAction[type] ?? []).filter(
      (cb) => cb !== callback
    )
  }
}

export const onWebsocketAction = async (
  ws: WebSocket,
  msg: ClientMessage & { type: 'action' }
) => {
  const callbacks = callbacksByAction[msg.data.type] ?? []
  try {
    await Promise.all(callbacks.map((cb) => cb(msg.data, ws)))
  } catch (e) {
    console.error(
      'Got error running subscribeToAction callback',
      msg,
      e && typeof e === 'object' && 'message' in e ? e.message : e
    )
  }
}

subscribeToAction('user-input', onUserInput)
subscribeToAction('check-npm-version', onCheckNpmVersion)
subscribeToAction('warm-context-cache', onWarmContextCache)
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
