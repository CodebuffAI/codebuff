import { WebSocket } from 'ws'
import { ClientMessage } from '@manicode/common/src/websockets/websocket-schema'
import { ProjectFileContext } from 'common/src/util/file'
import { promptClaudeAndGetFileChanges } from '../prompts'
import { ClientAction, ServerAction } from 'common/src/actions'
import { sendMessage } from './server'

const sendAction = (ws: WebSocket, action: ServerAction) => {
  sendMessage(ws, {
    type: 'action',
    data: action,
  })
}

const onUserInput = async (
  ws: WebSocket,
  { messages, fileContext }: Extract<ClientAction, { type: 'user-input' }>
) => {
  const lastMessage = messages[messages.length - 1]
  if (typeof lastMessage.content === 'string')
    console.log('Input:', lastMessage)
  const { changes, toolCall, response } = await promptClaudeAndGetFileChanges(
    messages,
    fileContext,
    (chunk) =>
      sendAction(ws, {
        type: 'response-chunk',
        chunk,
      })
  )

  if (changes.length > 0) {
    sendAction(ws, {
      type: 'change-files',
      changes,
    })
  }

  if (toolCall) {
    console.log('toolCall', toolCall.name, toolCall.input)
    sendAction(ws, {
      type: 'tool-call',
      response,
      data: toolCall,
    })
  }
}

export const onWebsocketAction = async (
  ws: WebSocket,
  msg: ClientMessage & { type: 'action' }
) => {
  try {
    switch (msg.data.type) {
      case 'user-input':
        await onUserInput(ws, msg.data)
        return
    }
  } catch (e) {
    console.error(
      'Got error running websocket action',
      msg,
      e && typeof e === 'object' && 'message' in e ? e.message : e
    )
  }
}
