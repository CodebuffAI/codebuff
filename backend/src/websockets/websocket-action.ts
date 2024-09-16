import { WebSocket } from 'ws'
import { ClientMessage } from 'common/websockets/websocket-schema'
import { mainPrompt } from '../main-prompt'
import { ClientAction, ServerAction } from 'common/actions'
import { sendMessage } from './server'
import { isEqual } from 'lodash'
import fs from 'fs'
import path from 'path'
import { getTools } from '../tools'
import { getSearchSystemPrompt } from '../system-prompt'
import { promptClaude, models } from '../claude'

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

const onCheckNpmVersion = async (
  { version }: Extract<ClientAction, { type: 'check-npm-version' }>,
  ws: WebSocket
) => {
  let latestVersion = version

  if (process.env.NODE_ENV === 'production') {
    const backendPackageJsonPath = path.join(__dirname, '..', 'package.json')
    const backendPackageJson = JSON.parse(
      fs.readFileSync(backendPackageJsonPath, 'utf-8')
    )
    latestVersion = backendPackageJson.version
  }

  const isUpToDate = version === latestVersion

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
  const tools = getTools()
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
      tools,
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
