import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { getFiles, getProjectFileContext } from './project-files'
import { ChatStorage } from './chat-storage'
import { FileChanges, Message } from 'common/actions'
import { toolHandlers, ToolHandler } from './tool-handlers'

export class ChatClient {
  private ws: APIRealtimeClient
  private chatStorage: ChatStorage
  private toolHandlers: Record<string, ToolHandler>

  constructor(websocketUrl: string, chatStorage: ChatStorage) {
    this.ws = new APIRealtimeClient(websocketUrl)
    this.chatStorage = chatStorage
    this.toolHandlers = toolHandlers
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

      const handler = this.toolHandlers[name]
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

  private async handleReadFiles(
    input: { file_paths: string[] },
    id: string
  ): Promise<string> {
    const { file_paths } = input
    return JSON.stringify(getFileBlocks(file_paths))
  }

  private async handleScrapeWebPage(
    input: { url: string },
    id: string
  ): Promise<string> {
    const { url } = input
    const content = await scrapeWebPage(url)
    if (!content) {
      return `<web_scraping_error url="${url}">Failed to scrape the web page.</web_scraping_error>`
    }
    return `<web_scraped_content url="${url}">${content}</web_scraped_content>`
  }
}
