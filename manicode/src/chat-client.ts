import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { getFiles, getProjectFileContext } from './project-files'
import { ChatStorage } from './chat-storage'
import { FileChanges, Message } from 'common/actions'
import { toolHandlers } from './tool-handlers'

export class ChatClient {
  private ws: APIRealtimeClient
  private chatStorage: ChatStorage

  constructor(websocketUrl: string, chatStorage: ChatStorage) {
    this.ws = new APIRealtimeClient(websocketUrl)
    this.chatStorage = chatStorage
  }

  async connect() {
    await this.ws.connect()
    this.setupSubscriptions()
  }

  private setupSubscriptions() {
    this.ws.subscribe('tool-call', async (a) => {
      const { response, changes, data } = a
      const { id, name, input } = data

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

    this.ws.subscribe('read-files', (a) => {
      const { filePaths } = a
      const files = getFiles(filePaths)

      this.ws.sendAction({
        type: 'read-files-response',
        files,
      })
    })
  }

  async sendUserInput(previousChanges: FileChanges) {
    const fileContext = await getProjectFileContext()
    this.ws.sendAction({
      type: 'user-input',
      messages: this.chatStorage.getCurrentChat().messages,
      fileContext,
      previousChanges,
    })
  }

  subscribeToResponse(onChunk: (chunk: string) => void) {
    let unsubscribe: () => void
    const unsubscribeWrapper = () => {
      unsubscribe()
    }

    const resolvePromise = new Promise<{
      response: string
      changes: FileChanges
    }>((resolve) => {
      const unsubscribeChunks = this.ws.subscribe('response-chunk', (a) => {
        const { chunk } = a
        onChunk(chunk)
      })

      const unsubscribeComplete = this.ws.subscribe(
        'response-complete',
        (a) => {
          unsubscribeChunks()
          unsubscribeComplete()
          resolve(a)
        }
      )
      unsubscribe = () => {
        unsubscribeChunks()
        unsubscribeComplete()
      }
    })

    return {
      result: resolvePromise,
      unsubscribe: unsubscribeWrapper,
    }
  }
}
