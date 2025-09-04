import { WEBSOCKET_URL } from './constants'
import { APIRealtimeClient } from '@codebuff/common/websockets/websocket-client'

import type { ServerAction, ClientAction } from '@codebuff/common/actions'
import type { WebSocket } from 'ws'

export type WebSocketHandlerOptions = {
  onWebsocketError?: (error: WebSocket.ErrorEvent) => void
  onWebsocketReconnect?: () => void
  onRequestReconnect?: () => Promise<void>
  onResponseError?: (error: ServerAction<'action-error'>) => Promise<void>
  readFiles: (input: {
    filePaths: string[]
  }) => Promise<ClientAction<'read-files-response'>['files']>
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
  private onPromptError: WebSocketHandlerOptionsWithDefaults['onPromptError']
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
      await this.cbWebSocket.connect()
      this.setupSubscriptions()
      this.isConnected = true
    }
  }

  public reconnect() {
    this.cbWebSocket.forceReconnect()
  }

  public close() {
    this.cbWebSocket.close()
    this.isConnected = false
  }

  private setupSubscriptions() {
    this.cbWebSocket.subscribe('action-error', this.onResponseError)

    this.cbWebSocket.subscribe('read-files', async (a) => {
      const { filePaths, requestId } = a
      const files = await this.readFiles({ filePaths })

      this.cbWebSocket.sendAction({
        type: 'read-files-response',
        files,
        requestId,
      })
    })

    // Handle backend-initiated tool call requests
    this.cbWebSocket.subscribe('tool-call-request', async (action) => {
      const toolCallResult = await this.handleToolCall(action)

      this.cbWebSocket.sendAction({
        type: 'tool-call-response',
        requestId: action.requestId,
        ...toolCallResult,
      })
    })

    this.cbWebSocket.subscribe('message-cost-response', this.onCostResponse)

    // Used to handle server restarts gracefully
    this.cbWebSocket.subscribe('request-reconnect', this.onRequestReconnect)

    // Handle streaming messages
    this.cbWebSocket.subscribe('response-chunk', this.onResponseChunk)
    this.cbWebSocket.subscribe(
      'subagent-response-chunk',
      this.onSubagentResponseChunk,
    )

    // Handle full response from prompt
    this.cbWebSocket.subscribe('prompt-response', this.onPromptResponse)
    this.cbWebSocket.subscribe('prompt-error', this.onPromptError)
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
    this.cbWebSocket.sendAction({
      ...action,
      ...this.getInputDefaultOptions(),
    })
  }

  public cancelInput({ promptId }: { promptId: string }) {
    this.cbWebSocket.sendAction({
      type: 'cancel-user-input',
      authToken: this.apiKey,
      promptId,
    })
  }
}
