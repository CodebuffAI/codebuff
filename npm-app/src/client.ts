import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { getFiles, getProjectFileContext } from './project-files'
import { ChatStorage } from './chat-storage'
import { FileChanges, Message } from 'common/actions'
import { toolHandlers } from './tool-handlers'

export class Client {
  private webSocket: APIRealtimeClient
  private chatStorage: ChatStorage

  constructor(websocketUrl: string, chatStorage: ChatStorage) {
    this.webSocket = new APIRealtimeClient(websocketUrl)
    this.chatStorage = chatStorage
  }

  async connect() {
    await this.webSocket.connect()
    this.setupSubscriptions()
  }

  private setupSubscriptions() {
    this.webSocket.subscribe('tool-call', async (a) => {
      const { response, changes, data } = a
      const { id, name, input } = data

      const messages = this.chatStorage.getCurrentChat().messages
      if (messages[messages.length - 1].role === 'assistant') {
        // Probably the last response from the assistant was cancelled and added immediately.
        return
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: response,
          },
          {
            type: 'tool_use',
            id,
            name,
            input,
          },
        ],
      }
      this.chatStorage.addMessage(
        this.chatStorage.getCurrentChat(),
        assistantMessage
      )

      const handler = toolHandlers[name]
      if (handler) {
        const content = await handler(input, id)
        const toolResultMessage: Message = {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: id,
              content,
            },
          ],
        }
        this.chatStorage.addMessage(
          this.chatStorage.getCurrentChat(),
          toolResultMessage
        )
        await this.sendUserInput(changes)
      } else {
        console.error(`No handler found for tool: ${name}`)
      }
    })

    this.webSocket.subscribe('read-files', (a) => {
      const { filePaths } = a
      const files = getFiles(filePaths)

      this.webSocket.sendAction({
        type: 'read-files-response',
        files,
      })
    })
  }

  async sendUserInput(previousChanges: FileChanges) {
    const fileContext = await getProjectFileContext()
    this.webSocket.sendAction({
      type: 'user-input',
      messages: this.chatStorage.getCurrentChat().messages,
      fileContext,
      previousChanges,
    })
  }

  subscribeToResponse(onChunk: (chunk: string) => void) {
    let responseBuffer = ''
    let resolveResponse: (value: {
      response: string
      changes: FileChanges
      wasStoppedByUser: boolean
    }) => void
    let rejectResponse: (reason?: any) => void
    let unsubscribeChunks: () => void
    let unsubscribeComplete: () => void

    const responsePromise = new Promise<{
      response: string
      changes: FileChanges
      wasStoppedByUser: boolean
    }>((resolve, reject) => {
      resolveResponse = resolve
      rejectResponse = reject
    })

    const stopResponse = () => {
      unsubscribeChunks()
      unsubscribeComplete()
      resolveResponse({
        response: responseBuffer + '\n[RESPONSE_STOPPED_BY_USER]',
        changes: [],
        wasStoppedByUser: true,
      })
    }

    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {
      const { chunk } = a
      responseBuffer += chunk
      onChunk(chunk)
    })

    unsubscribeComplete = this.webSocket.subscribe('response-complete', (a) => {
      unsubscribeChunks()
      unsubscribeComplete()
      resolveResponse({ ...a, wasStoppedByUser: false })
    })

    return {
      responsePromise,
      stopResponse,
    }
  }
}
