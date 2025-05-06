import WebSocket from 'ws'
import { EventEmitter } from '../events/emitter'
import { ConnectionStatus, ConnectionError } from './status'
import { RetryOptions } from '../types/config'
import { ClientEventMap } from '../events/types'
import { ActionDispatcher } from '../actions/dispatcher'
import { ActionHandler } from '../actions/handlers'
import { SERVER_MESSAGE_SCHEMA } from '../actions/types'

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private retryOptions: RetryOptions;
  private retryCount = 0;
  private retryTimeout: NodeJS.Timeout | null = null;
  private status: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private events: EventEmitter;
  private dispatcher: ActionDispatcher | null = null;
  private handler: ActionHandler;

  constructor(url: string, retryOptions: RetryOptions, projectRoot: string) {
    this.url = url;
    this.retryOptions = retryOptions;
    this.events = new EventEmitter();
    this.handler = new ActionHandler(this.events, projectRoot);
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.setStatus(ConnectionStatus.CONNECTING);
        
        this.ws = new WebSocket(this.url);
        this.dispatcher = new ActionDispatcher(this.ws, this.events);
        this.handler.setDispatcher(this.dispatcher);

        this.ws.on('open', () => {
          this.setStatus(ConnectionStatus.CONNECTED);
          this.retryCount = 0;
          
          // Identify this client
          this.dispatcher?.identify();
          
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const rawMessage = JSON.parse(data.toString());
            const message = SERVER_MESSAGE_SCHEMA.parse(rawMessage);
            this.handler.handleMessage(message);
          } catch (err) {
            this.emitError(new Error('Failed to parse message: ' + err));
          }
        });

        this.ws.on('close', () => {
          this.handleDisconnect();
        });

        this.ws.on('error', (err) => {
          this.emitError(err);
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(err);
          }
        });

      } catch (err) {
        this.handleDisconnect();
        reject(err);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.dispatcher = null;
    this.handler.setDispatcher(null);
    this.setStatus(ConnectionStatus.DISCONNECTED);
  }

  send(action: unknown): void {
    if (!this.dispatcher) {
      throw new Error('WebSocket is not connected');
    }

    this.dispatcher.send(action as any); // TODO: Type this properly
  }

  on<T extends keyof ClientEventMap>(
    type: T,
    handler: (event: ClientEventMap[T]) => void
  ): () => void {
    return this.events.on(type, handler);
  }

  private handleDisconnect(): void {
    const wasConnected = this.status === ConnectionStatus.CONNECTED;
    
    if (wasConnected) {
      this.setStatus(ConnectionStatus.RECONNECTING);
      this.attemptReconnect();
    } else if (this.status === ConnectionStatus.CONNECTING) {
      this.attemptReconnect();
    } else {
      this.setStatus(ConnectionStatus.DISCONNECTED);
    }
  }

  private attemptReconnect(): void {
    if (this.retryCount >= this.retryOptions.maxAttempts) {
      this.emitError(new Error('Max retry attempts reached'));
      this.setStatus(ConnectionStatus.DISCONNECTED);
      return;
    }

    const delay = Math.min(
      this.retryOptions.initialDelay * Math.pow(this.retryOptions.backoffFactor, this.retryCount),
      this.retryOptions.maxDelay
    );

    this.retryCount++;

    this.retryTimeout = setTimeout(() => {
      this.connect().catch((err) => {
        this.emitError(err);
      });
    }, delay);
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    this.events.emit('status', { type: 'status', status, message });
  }

  private emitError(error: Error): void {
    this.events.emit('error', { type: 'error', error });
  }

  getStatus(): ConnectionStatus | ConnectionError {
    if (this.status === ConnectionStatus.ERROR) {
      return {
        status: ConnectionStatus.ERROR,
        error: new Error('Connection error'),
        retryCount: this.retryCount
      };
    }
    return this.status;
  }
}