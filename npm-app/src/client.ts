import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { getFiles, getProjectFileContext } from './project-files'
import { ChatStorage } from './chat-storage'
import { FileChanges, Message } from 'common/actions'
import { toolHandlers } from './tool-handlers'
import { STOP_MARKER } from 'common/constants'

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
      const { response, changes, data, userInputId } = a
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
        await this.sendUserInput(changes, userInputId)
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

  async sendUserInput(previousChanges: FileChanges, userInputId: string) {
    const messages = this.chatStorage.getCurrentChat().messages
    const messageText = messages
      .map((m) => JSON.stringify(m.content))
      .join('\n')
    const filesContent = messageText.match(/<files>(.*?)<\/files>/gs)
    const lastFilesContent = filesContent
      ? filesContent[filesContent.length - 1]
      : ''
    const fileList = lastFilesContent
      .replace(/<\/?files>/g, '')
      .trim()
      .split(', ')

    const fileContext = await getProjectFileContext(fileList)
    this.webSocket.sendAction({
      type: 'user-input',
      userInputId,
      messages,
      fileContext,
      previousChanges,
    })
  }

  subscribeToResponse(
    onChunk: (chunk: string) => void,
    userInputId: string,
    onStreamStart: () => void
  ) {
    let responseBuffer = ''
    let resolveResponse: (value: {
      response: string
      changes: FileChanges
      wasStoppedByUser: boolean
    }) => void
    let rejectResponse: (reason?: any) => void
    let unsubscribeChunks: () => void
    let unsubscribeComplete: () => void
    let streamStarted = false

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
      if (a.userInputId !== userInputId) return
      const { chunk } = a
      
      if (!streamStarted) {
        streamStarted = true
        onStreamStart()
      }
      
      responseBuffer += chunk
      onChunk(chunk)

      // Print a message when the response is complete, before the file changes are generated.
      if (responseBuffer.includes(STOP_MARKER)) {
        if (responseBuffer.includes('<' + '/file>'))
          console.log('\n\nGenerating file changes. Please wait...')
      }
    })

    unsubscribeComplete = this.webSocket.subscribe('response-complete', (a) => {
      if (a.userInputId !== userInputId) return
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
