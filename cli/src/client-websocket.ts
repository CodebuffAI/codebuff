import { APIRealtimeClient } from '../../common/src/websockets/websocket-client'
import type { Message, ServerAction } from '../../common/src/actions'
import type { z } from 'zod'

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'wss://api.codebuff.dev'

class WebSocketClient {
  private webSocket: APIRealtimeClient
  private currentUserInputId: string | undefined
  private messageCallback: ((message: Message) => void) | undefined

  constructor(onError: () => void) {
    this.webSocket = new APIRealtimeClient(backendUrl, onError)
  }

  async connect() {
    await this.webSocket.connect()
    this.setupSubscriptions()
  }

  private setupSubscriptions() {
    // Handle errors
    this.webSocket.subscribe('action-error', (action: Extract<ServerAction, { type: 'action-error' }>) => {
      console.error(`Error: ${action.message}`)
      return
    })

    // Handle response chunks (streaming responses)
    this.webSocket.subscribe('response-chunk', (action: Extract<ServerAction, { type: 'response-chunk' }>) => {
      if (action.userInputId !== this.currentUserInputId) return
      const { chunk } = action
      
      if (this.messageCallback) {
        this.messageCallback({
          role: 'assistant',
          content: chunk
        })
      }
    })

    // Handle complete responses
    this.webSocket.subscribe('response-complete', (action: Extract<ServerAction, { type: 'response-complete' }>) => {
      if (action.userInputId !== this.currentUserInputId) return
      this.currentUserInputId = undefined
    })
  }

  setMessageCallback(callback: (message: Message) => void) {
    this.messageCallback = callback
  }

  async sendMessage(message: string) {
    const userInputId = Date.now().toString()
    this.currentUserInputId = userInputId

    this.webSocket.sendAction({
      type: 'user-input',
      userInputId,
      messages: [{
        role: 'user',
        content: message
      }],
      fileContext: {
        currentWorkingDirectory: process.cwd(),
        fileTree: [],
        fileTokenScores: {},
        knowledgeFiles: {},
        fileVersions: [],
        gitChanges: {
          status: '',
          diff: '',
          diffCached: '',
          lastCommitMessages: ''
        },
        changesSinceLastChat: {},
        shellConfigFiles: {},
        systemInfo: {
          platform: process.platform,
          shell: process.env.SHELL || '',
          nodeVersion: process.version,
          arch: process.arch,
          homedir: process.env.HOME || '',
          cpus: require('os').cpus().length
        }
      },
      changesAlreadyApplied: [],
      fingerprintId: '', // Will be properly implemented in step 005
      authToken: '', // Will be properly implemented in step 005
      costMode: 'normal'
    })
  }
}

// Export singleton instance
export const webSocketClient = new WebSocketClient(() => {
  console.error('WebSocket error. Attempting reconnect...')
})
