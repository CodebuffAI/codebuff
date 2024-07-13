import { WebSocket } from 'ws'
import { ClientMessage } from '@manicode/common/src/websockets/websocket-schema'
import { ProjectFileContext } from 'common/src/util/file'
import { promptClaudeAndGetFileChanges } from '../prompts'
import { ServerAction } from 'common/src/actions'
import { sendMessage } from './server'

const sendAction = (ws: WebSocket, action: ServerAction) => {
  sendMessage(ws, {
    type: 'action',
    data: action,
  })
}

const onUserInput = async (
  ws: WebSocket,
  input: string,
  fileContext: ProjectFileContext
) => {
  const { changes } = await promptClaudeAndGetFileChanges(
    input,
    fileContext,
    (chunk) =>
      sendAction(ws, {
        type: 'response-chunk',
        chunk,
      })
  )

  sendAction(ws, {
    type: 'change-files',
    changes,
  })
}

export const onWebsocketAction = (
  ws: WebSocket,
  msg: ClientMessage & { type: 'action' }
) => {
  console.log('onAction', msg)

  switch (msg.data.type) {
    case 'user-input':
      const { input, fileContext } = msg.data
      onUserInput(ws, input, fileContext)
      return
  }
}
