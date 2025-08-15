import { WEBSOCKET_URL } from './constants'
import { APIRealtimeClient } from '../../common/src/websockets/websocket-client'

import type { ServerAction, ClientAction } from '../../common/src/actions'
import type { WebSocket } from 'ws'

// Add env-gated SDK debug helper
function isSdkDebugEnabled() {
  const v =
    process.env.CODEBUFF_SDK_DEBUG ?? process.env.CODEBUFF_GITHUB_ACTIONS
  if (typeof v !== 'string') return !!v
  const low = v.toLowerCase()
  return low === 'true' || v === '1'
}

export type WebSocketHandlerOptions = {
  onWebsocketError?: (error: WebSocket.ErrorEvent) => void
  onWebsocketReconnect?: () => void
  onRequestReconnect?: () => Promise<void>
  onResponseError?: (error: ServerAction<'action-error'>) => Promise<void>
  readFiles: (
    filePath: string[],
  ) => Promise<ClientAction<'read-files-response'>['files']>
  handleToolCall: (
    action: ServerAction<'tool-call-request'>,
  ) => Promise<Omit<ClientAction<'tool-call-response'>, 'type' | 'requestId'>>
  onCostResponse?: (
    action: ServerAction<'message-cost-response'>,
  ) => Promise<void>

  onResponseChunk?: (action: ServerAction<'response-chunk'>) => Promise<void>
  onSubagentResponseChunk?: (
    action: ServerAction<'subagent-response-chunk'>,
  ) => Promise<void>

  onPromptResponse?: (action: ServerAction<'prompt-response'>) => Promise<void>
  onPromptError?: (action: ServerAction<'prompt-error'>) => Promise<void>

  apiKey: string
}

type WebSocketHandlerOptionsWithDefaults = Required<WebSocketHandlerOptions>

export class WebSocketHandler {
  private cbWebSocket: APIRealtimeClient
  private onRequestReconnect: WebSocketHandlerOptionsWithDefaults['onRequestReconnect']

  private onResponseError: WebSocketHandlerOptionsWithDefaults['onResponseError']
  private readFiles: WebSocketHandlerOptionsWithDefaults['readFiles']
  private handleToolCall: WebSocketHandlerOptionsWithDefaults['handleToolCall']
  private onCostResponse: WebSocketHandlerOptionsWithDefaults['onCostResponse']
  private onResponseChunk: WebSocketHandlerOptionsWithDefaults['onResponseChunk']
  private onSubagentResponseChunk: WebSocketHandlerOptionsWithDefaults['onSubagentResponseChunk']
  private onPromptResponse: WebSocketHandlerOptionsWithDefaults['onPromptResponse']
  private onPromptError: Required<WebSocketHandlerOptions>['onPromptError']
  private apiKey: string
  private isConnected = false

  constructor({
    onWebsocketError = () => {},
    onWebsocketReconnect = () => {},
    onRequestReconnect = async () => {},
    onResponseError = async () => {},
    readFiles,
    handleToolCall,
    onCostResponse = async () => {},

    onResponseChunk = async () => {},
    onSubagentResponseChunk = async () => {},

    onPromptResponse = async () => {},
    onPromptError = async () => {},

    apiKey,
  }: WebSocketHandlerOptions) {
    this.cbWebSocket = new APIRealtimeClient(
      WEBSOCKET_URL,
      onWebsocketError,
      onWebsocketReconnect,
    )
    this.onRequestReconnect = onRequestReconnect

    this.onResponseError = onResponseError
    this.readFiles = readFiles
    this.handleToolCall = handleToolCall
    this.onCostResponse = onCostResponse

    this.onResponseChunk = onResponseChunk
    this.onSubagentResponseChunk = onSubagentResponseChunk

    this.onPromptResponse = onPromptResponse
    this.onPromptError = onPromptError

    this.apiKey = apiKey
  }

  public async connect() {
    if (!this.isConnected) {
      // Add debug logs around connection lifecycle
      if (isSdkDebugEnabled())
        console.log('[sdk][ws] connecting', { url: WEBSOCKET_URL })
      await this.cbWebSocket.connect()
      this.setupSubscriptions()
      this.isConnected = true
      if (isSdkDebugEnabled()) console.log('[sdk][ws] connected')
    }
  }

  public reconnect() {
    this.cbWebSocket.forceReconnect()
  }

  public close() {
    this.cbWebSocket.close()
  }

  private setupSubscriptions() {
    // action-error
    this.cbWebSocket.subscribe('action-error', async (a) => {
      if (isSdkDebugEnabled())
        console.error('[sdk][cb] action-error', (a as any)?.message ?? a)
      await this.onResponseError(a as any)
    })

    // read-files
    this.cbWebSocket.subscribe('read-files', async (a) => {
      if (isSdkDebugEnabled())
        console.log('[sdk][cb] read-files request', {
          count: (a as any)?.filePaths?.length,
        })
      const { filePaths, requestId } = a
      const files = await this.readFiles(filePaths)
      this.cbWebSocket.sendAction({
        type: 'read-files-response',
        files,
        requestId,
      })
      if (isSdkDebugEnabled())
        console.log('[sdk][cb] read-files response', {
          keys: Object.keys(files || {}),
        })
    })

    // Handle backend-initiated tool call requests
    this.cbWebSocket.subscribe('tool-call-request', async (action) => {
      if (isSdkDebugEnabled())
        console.log('[sdk][cb] tool-call-request', {
          tool: (action as any)?.toolName,
        })
      const toolCallResult = await this.handleToolCall(action)
      this.cbWebSocket.sendAction({
        type: 'tool-call-response',
        requestId: action.requestId,
        ...toolCallResult,
      })
      if (isSdkDebugEnabled())
        console.log('[sdk][cb] tool-call-response', {
          success: (toolCallResult as any)?.success,
        })
    })

    this.cbWebSocket.subscribe('message-cost-response', async (a) => {
      if (isSdkDebugEnabled()) console.log('[sdk][cb] message-cost-response')
      await this.onCostResponse(a as any)
    })

    // Used to handle server restarts gracefully
    this.cbWebSocket.subscribe('request-reconnect', async () => {
      if (isSdkDebugEnabled()) console.log('[sdk][cb] request-reconnect')
      await this.onRequestReconnect()
    })

    // Handle streaming messages
    this.cbWebSocket.subscribe('response-chunk', async (a) => {
      if (isSdkDebugEnabled()) console.log('[sdk][cb] response-chunk')
      await this.onResponseChunk(a as any)
    })
    this.cbWebSocket.subscribe('subagent-response-chunk', async (a) => {
      if (isSdkDebugEnabled()) console.log('[sdk][cb] subagent-response-chunk')
      await this.onSubagentResponseChunk(a as any)
    })

    // Handle full response from prompt
    this.cbWebSocket.subscribe('prompt-response', async (a) => {
      if (isSdkDebugEnabled()) console.log('[sdk][cb] prompt-response')
      await this.onPromptResponse(a as any)
    })

    this.cbWebSocket.subscribe('prompt-error', async (a) => {
      if (isSdkDebugEnabled())
        console.error('[sdk][cb] prompt-error', {
          message: (a as any)?.message,
          userInputId: (a as any)?.userInputId,
        })
      await this.onPromptError(a as any)
    })
  }

  private getInputDefaultOptions() {
    return {
      ...({
        type: 'prompt',
      } as const),
      authToken: this.apiKey,
    }
  }

  public sendInput(
    action: Omit<
      ClientAction<'prompt'>,
      keyof ReturnType<typeof this.getInputDefaultOptions>
    >,
  ) {
    if (isSdkDebugEnabled()) {
      const pid = (action as any)?.promptId
      const agentId = (action as any)?.agentId
      console.log('[sdk][cb] sendAction prompt', { promptId: pid, agentId })
    }
    this.cbWebSocket.sendAction({
      ...action,
      ...this.getInputDefaultOptions(),
    })
  }

  public cancelInput({ promptId }: { promptId: string }) {
    if (isSdkDebugEnabled())
      console.log('[sdk][cb] cancel-user-input', { promptId })
    this.cbWebSocket.sendAction({
      type: 'cancel-user-input',
      authToken: this.apiKey,
      promptId,
    })
  }
}
