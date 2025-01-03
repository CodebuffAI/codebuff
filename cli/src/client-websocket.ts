import { APIRealtimeClient } from '../../common/src/websockets/websocket-client'
import type { Message, ServerAction } from '../../common/src/actions'
import { InitResponseSchema, ResponseCompleteSchema } from '../../common/src/actions'
import type { z } from 'zod'
import path from 'path'
import { ChatStorage } from './util/chat-storage'
import { calculateFingerprint } from './util/fingerprint'
import { getProjectFileContext, getProjectRoot } from './util/project-files'
import { applyChanges } from '../../common/src/util/changes'
import { toolHandlers } from '../../npm-app/src/tool-handlers'
import { TOOL_RESULT_MARKER } from '../../common/src/constants'
import type { FileVersion } from '../../common/src/util/file'

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'wss://api.codebuff.dev'

class WebSocketClient {
  private webSocket: APIRealtimeClient
  private currentUserInputId: string | undefined
  private messageCallback: ((message: Message | { role: 'system'; content: string }) => void) | undefined
  protected usageUpdateCallbacks: ((data: { usage: number; limit: number }) => void)[] = []
  private chatStorage: ChatStorage
  private usage: number = 0
  private limit: number = 0
  private subscription_active: boolean = false
  private nextQuotaReset: Date | null = null
  private lastRequestCredits: number = 0
  private sessionCreditsUsed: number = 0
  private fingerprintId: string | undefined

  constructor(onError: () => void) {
    this.webSocket = new APIRealtimeClient(backendUrl, onError)
    
    // Initialize chat storage in user's home directory
    const homeDir = require('os').homedir()
    const storageDir = path.join(homeDir, '.codebuff', 'chats')
    this.chatStorage = new ChatStorage(storageDir)
  }

  async connect() {
    await this.webSocket.connect()
    this.setupSubscriptions()
    await this.warmContextCache()
  }

  private async warmContextCache() {
    const fileContext = await getProjectFileContext(
      getProjectRoot(),
      {},
      []
    )

    this.webSocket.subscribe('init-response', (action) => {
      const parsedAction = InitResponseSchema.safeParse(action)
      if (!parsedAction.success) return
      this.setUsage(parsedAction.data)
    })

    try {
      this.fingerprintId = await calculateFingerprint()
      await this.webSocket.sendAction({
        type: 'init',
        fingerprintId: this.fingerprintId,
        authToken: undefined, // We'll implement auth later if needed
        fileContext,
      })
    } catch (e) {
      console.error('Error warming context cache:', e)
    }
  }

  private setUsage(data: {
    usage: number
    limit: number
    subscription_active: boolean
    next_quota_reset: Date | null
    session_credits_used?: number
  }) {
    // Notify usage update listeners
    this.usageUpdateCallbacks.forEach(callback => callback({
      usage: data.usage,
      limit: data.limit
    }))
    this.usage = data.usage
    this.limit = data.limit
    this.subscription_active = data.subscription_active
    this.nextQuotaReset = data.next_quota_reset
    if (data.session_credits_used !== undefined) {
      this.lastRequestCredits = Math.max(
        data.session_credits_used - (this.sessionCreditsUsed || 0),
        0
      )
      this.sessionCreditsUsed = data.session_credits_used
    }
  }

  private fileVersions: FileVersion[][] = []

  private setupSubscriptions() {
    // Handle errors
    this.webSocket.subscribe('action-error', (action: Extract<ServerAction, { type: 'action-error' }>) => {
      console.error(`Error: ${action.message}`)
      if (this.messageCallback) {
        this.messageCallback({
          role: 'system',
          content: `Error: ${action.message}`
        })
      }
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
      
      const parsedAction = ResponseCompleteSchema.safeParse(action)
      if (!parsedAction.success) return
      const a = parsedAction.data

      // Update file versions
      if (a.resetFileVersions) {
        this.fileVersions = [a.addedFileVersions]
      } else {
        this.fileVersions.push(a.addedFileVersions)
      }

      // Save changes to chat storage
      const filesChanged = [...new Set(a.changes.map(change => change.filePath))]
      this.chatStorage.saveFilesChanged(filesChanged)

      // Apply changes to files
      applyChanges(getProjectRoot(), a.changes)

      // Update usage if available
      if (a.usage && a.limit && a.next_quota_reset !== undefined && a.subscription_active !== undefined) {
        this.setUsage({
          usage: a.usage,
          limit: a.limit,
          subscription_active: a.subscription_active,
          next_quota_reset: a.next_quota_reset,
          session_credits_used: a.session_credits_used ?? 0
        })
      }

      this.currentUserInputId = undefined
    })

    // Handle tool calls
    this.webSocket.subscribe('tool-call', async (action: Extract<ServerAction, { type: 'tool-call' }>) => {
      const {
        response,
        changes,
        changesAlreadyApplied,
        data,
        userInputId,
        addedFileVersions,
        resetFileVersions,
      } = action

      if (userInputId !== this.currentUserInputId) return

      // Update file versions
      if (resetFileVersions) {
        this.fileVersions = [addedFileVersions]
      } else {
        this.fileVersions.push(addedFileVersions)
      }

      // Save changed files
      const filesChanged = [...new Set(changes.map(change => change.filePath))]
      this.chatStorage.saveFilesChanged(filesChanged)

      // Apply changes to files
      applyChanges(getProjectRoot(), changes)

      // Send assistant message
      if (this.messageCallback) {
        this.messageCallback({
          role: 'assistant',
          content: response
        })
      }

      // Handle tool result
      const { id, name, input } = data
      const handler = toolHandlers[name]
      if (handler) {
        const content = await handler(input, id)
        if (this.messageCallback) {
          this.messageCallback({
            role: 'user',
            content: `${TOOL_RESULT_MARKER}\n${content}`
          })
        }
        await this.sendUserInput([...changesAlreadyApplied, ...changes], userInputId)
      } else {
        console.error(`No handler found for tool: ${name}`)
        if (this.messageCallback) {
          this.messageCallback({
            role: 'system',
            content: `Error: No handler found for tool: ${name}`
          })
        }
      }
    })
  }

  setMessageCallback(callback: (message: Message | { role: 'system'; content: string }) => void) {
    this.messageCallback = callback
  }

  private async sendUserInput(previousChanges: any[], userInputId: string) {
    const currentChat = this.chatStorage.getCurrentChat()
    const { messages } = currentChat

    const fileContext = await getProjectFileContext(
      getProjectRoot(),
      {},
      this.fileVersions
    )

    await this.webSocket.sendAction({
      type: 'user-input',
      userInputId,
      messages,
      fileContext,
      changesAlreadyApplied: previousChanges,
      fingerprintId: this.fingerprintId || '',
      authToken: undefined, // Will be implemented later if needed
      costMode: 'normal' as const
    })
  }

  async sendMessage(message: string) {
    const userInputId = Date.now().toString()
    this.currentUserInputId = userInputId

    // Add message to chat storage
    const userMessage: Message = {
      role: 'user',
      content: message
    }
    this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), userMessage)

    // Send message with current context
    await this.sendUserInput([], userInputId)
  }
}

// Export singleton instance
export class WebSocketClientWithUsage extends WebSocketClient {
  onUsageUpdate(callback: (data: { usage: number; limit: number }) => void) {
    this.usageUpdateCallbacks.push(callback)
  }

  offUsageUpdate(callback: (data: { usage: number; limit: number }) => void) {
    this.usageUpdateCallbacks = this.usageUpdateCallbacks.filter(cb => cb !== callback)
  }
}

export const webSocketClient = new WebSocketClientWithUsage(() => {
  console.error('WebSocket error. Attempting reconnect...')
}) as WebSocketClientWithUsage
