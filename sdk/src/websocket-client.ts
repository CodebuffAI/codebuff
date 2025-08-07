import { WEBSOCKET_URL } from './constants'
import { APIRealtimeClient } from '../../common/src/websockets/websocket-client'

import type { ServerAction, ClientAction } from '../../common/src/actions'
import type { WebSocket } from 'ws'

export type WebSocketHandlerOptions = {
  onWebsocketError: (error: WebSocket.ErrorEvent) => void
  onWebsocketReconnect: () => void
  onRequestReconnect: () => Promise<void>
  onResponseError: (
    error: Extract<ServerAction, { type: 'action-error' }>,
  ) => Promise<void>
  readFiles: (
    filePath: string[],
  ) => Promise<Extract<ClientAction, { type: 'read-files-response' }>['files']>
  handleToolCall: (
    action: Extract<ServerAction, { type: 'tool-call-request' }>,
  ) => Promise<
    Omit<
      Extract<ClientAction, { type: 'tool-call-response' }>,
      'type' | 'requestId'
    >
  >
  onCostResponse: (
    action: Extract<ServerAction, { type: 'message-cost-response' }>,
  ) => Promise<void>
  onUsageResponse: (
    action: Extract<ServerAction, { type: 'usage-response' }>,
  ) => Promise<void>

  onResponseChunk: (
    action: Extract<ServerAction, { type: 'response-chunk' }>,
  ) => Promise<void>
  onSubagentResponseChunk: (
    action: Extract<ServerAction, { type: 'subagent-response-chunk' }>,
  ) => Promise<void>

  onPromptResponse: (
    action: Extract<ServerAction, { type: 'prompt-response' }>,
  ) => Promise<void>
}

export class WebSocketHandler {
  private cbWebSocket: APIRealtimeClient
  private onRequestReconnect: NonNullable<
    WebSocketHandlerOptions['onRequestReconnect']
  >
  private onResponseError: WebSocketHandlerOptions['onResponseError']
  private readFiles: WebSocketHandlerOptions['readFiles']
  private handleToolCall: WebSocketHandlerOptions['handleToolCall']
  private onCostResponse: WebSocketHandlerOptions['onCostResponse']
  private onUsageResponse: WebSocketHandlerOptions['onUsageResponse']
  private onResponseChunk: WebSocketHandlerOptions['onResponseChunk']
  private onSubagentResponseChunk: WebSocketHandlerOptions['onSubagentResponseChunk']
  private onPromptResponse: WebSocketHandlerOptions['onPromptResponse']

  constructor({
    onWebsocketError = () => {},
    onWebsocketReconnect = () => {},
    onRequestReconnect = async () => {},
    onResponseError = async () => {},
    readFiles,
    handleToolCall,
    onCostResponse = async () => {},
    onUsageResponse = async () => {},

    onResponseChunk = async () => {},
    onSubagentResponseChunk = async () => {},

    onPromptResponse = async () => {},
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
    this.onUsageResponse = onUsageResponse

    this.onResponseChunk = onResponseChunk
    this.onSubagentResponseChunk = onSubagentResponseChunk

    this.onPromptResponse = onPromptResponse
  }

  public async connect() {
    await this.cbWebSocket.connect()
    this.setupSubscriptions()
  }

  public reconnect() {
    this.cbWebSocket.forceReconnect()
  }

  public close() {
    this.cbWebSocket.close()
  }

  public async init({
    authToken: apiKey,
    fileContext,
    repoUrl,
  }: Extract<ClientAction, { type: 'init' }>): Promise<
    Extract<ServerAction, { type: 'init-response' }>
  > {
    let resolve!: (v: Extract<ServerAction, { type: 'init-response' }>) => void
    const promise = new Promise<
      Extract<ServerAction, { type: 'init-response' }>
    >((res) => {
      resolve = res
    })
    this.cbWebSocket.subscribe('init-response', resolve)

    this.cbWebSocket.sendAction({
      type: 'init',
      fingerprintId: 'codebuff-sdk',
      authToken: apiKey,
      fileContext,
      repoUrl,
    })

    return promise
  }

  private setupSubscriptions() {
    this.cbWebSocket.subscribe('action-error', this.onResponseError)

    this.cbWebSocket.subscribe('read-files', async (a) => {
      const { filePaths, requestId } = a
      const files = await this.readFiles(filePaths)

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

    this.cbWebSocket.subscribe('usage-response', this.onUsageResponse)

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
  }
}
