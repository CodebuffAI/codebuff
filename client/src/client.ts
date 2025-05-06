import { AgentState } from 'common/types/agent-state'
import { ClientConfig, DEFAULT_RETRY_OPTIONS } from './types/config'
import { ClientEvent } from './events/types'
import { ConnectionStatus, ConnectionError } from './connection/status'
import { WebSocketClient } from './connection/websocket'
import { EventEmitter } from './events/emitter'

export class CodebuffClient {
  private config: ClientConfig;
  private ws: WebSocketClient;
  private events: EventEmitter;
  private agentState: AgentState | null = null;

  constructor(config: ClientConfig) {
    this.config = {
      ...config,
      retry: config.retry || DEFAULT_RETRY_OPTIONS
    };
    
    this.ws = new WebSocketClient(
      config.websocketUrl,
      this.config.retry!,
      config.projectRoot
    );
    this.events = new EventEmitter();

    // Forward WebSocket events to client events
    this.ws.on('text', (event) => this.events.emit('text', event));
    this.ws.on('status', (event) => this.events.emit('status', event));
    this.ws.on('error', (event) => this.events.emit('error', event));
  }

  async connect(): Promise<void> {
    await this.ws.connect();
  }

  async disconnect(): Promise<void> {
    await this.ws.disconnect();
  }

  async sendPrompt(options: {
    prompt: string;
    agentState: AgentState;
    model?: string;
  }): Promise<AsyncIterableStream<ClientEvent>> {
    this.agentState = options.agentState;

    // Create an async iterator that yields events
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        let done = false;
        const eventQueue: ClientEvent[] = [];
        let resolveNext: (() => void) | null = null;

        // Set up event handlers
        const unsubscribers = [
          self.events.on('text', (event) => {
            eventQueue.push(event);
            resolveNext?.();
          }),
          self.events.on('tool-start', (event) => {
            eventQueue.push(event);
            resolveNext?.();
          }),
          self.events.on('tool-end', (event) => {
            eventQueue.push(event);
            resolveNext?.();
          }),
          self.events.on('file-change', (event) => {
            eventQueue.push(event);
            resolveNext?.();
          }),
          self.events.on('error', (event) => {
            eventQueue.push(event);
            resolveNext?.();
          }),
          self.events.on('complete', (event) => {
            eventQueue.push(event);
            done = true;
            resolveNext?.();
          })
        ];

        try {
          // Send the prompt
          self.ws.send({
            type: 'prompt',
            prompt: options.prompt,
            agentState: options.agentState,
            model: options.model
          });

          // Yield events as they arrive
          while (!done || eventQueue.length > 0) {
            if (eventQueue.length === 0) {
              await new Promise<void>(resolve => {
                resolveNext = resolve;
              });
            }

            if (eventQueue.length > 0) {
              yield eventQueue.shift()!;
            }
          }
        } finally {
          // Clean up event handlers
          unsubscribers.forEach(unsubscribe => unsubscribe());
        }
      }
    };
  }

  async login(options?: any): Promise<void> {
    // TODO: Implement login
    throw new Error('Not implemented');
  }

  async logout(): Promise<void> {
    // TODO: Implement logout
    throw new Error('Not implemented');
  }

  getStatus(): ConnectionStatus | ConnectionError {
    return this.ws.getStatus();
  }

  getAgentState(): AgentState | null {
    return this.agentState;
  }
}

// Helper type for AsyncIterableStream
export type AsyncIterableStream<T> = AsyncIterable<T>;