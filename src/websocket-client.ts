import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { applyChanges, getFileBlocks, getFiles, getProjectFileContext } from './project-files'
import { ChatStorage } from './chat-storage'
import { Message } from 'common/actions'

export class WebSocketClient {
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
    this.ws.subscribe('change-files', (a) => {
      const changesSuceeded = applyChanges(a.changes)
      for (const change of changesSuceeded) {
        const { filePath, old } = change
        console.log('>', old ? 'Updated' : 'Created', filePath)
      }
    })

    this.ws.subscribe('tool-call', (a) => {
      const { response, data } = a
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
      this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), assistantMessage)

      if (name === 'read_files') {
        const { file_paths } = input
        const files = getFileBlocks(file_paths)

        const toolResultMessage: Message = {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: id,
              content: files,
            },
          ],
        }
        this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), toolResultMessage)

        this.sendUserInput()
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

  sendUserInput() {
    this.ws.sendAction({
      type: 'user-input',
      messages: this.chatStorage.getCurrentChat().messages,
      fileContext: getProjectFileContext(),
    })
  }

  subscribeToResponseChunks(callback: (chunk: string) => void) {
    return this.ws.subscribe('response-chunk', (a) => {
      const { chunk } = a
      callback(chunk)
    })
  }
}
