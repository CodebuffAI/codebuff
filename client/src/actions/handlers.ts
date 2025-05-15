import { EventEmitter } from '../events/emitter'
import { ServerMessage, ServerAction } from './types'
import { ToolExecutor } from '../tools/executor'
import { ActionDispatcher } from './dispatcher'

export class ActionHandler {
  private events: EventEmitter;
  private toolExecutor: ToolExecutor;
  private dispatcher: ActionDispatcher | null = null;

  constructor(events: EventEmitter, projectRoot: string) {
    this.events = events;
    this.toolExecutor = new ToolExecutor(projectRoot);
  }

  setDispatcher(dispatcher: ActionDispatcher | null): void {
    this.dispatcher = dispatcher;
  }

  handleMessage(message: ServerMessage): void {
    if (message.type === 'action') {
      this.handleAction(message.data);
    } else if (message.type === 'ack') {
      // Handle acknowledgment if needed
      if (!message.success) {
        this.events.emit('error', {
          type: 'error',
          error: new Error(message.error || 'Unknown error')
        });
      }
    }
  }

  private async handleAction(action: ServerAction): Promise<void> {
    switch (action.type) {
      case 'response-chunk':
        this.events.emit('text', {
          type: 'text',
          content: action.chunk,
          source: 'ai'
        });
        break;

      case 'tool-call':
        try {
          // Emit tool start event
          this.events.emit('tool-start', {
            type: 'tool-start',
            tool: {
              id: action.data.id,
              name: action.data.name,
              parameters: action.data.input
            }
          });
          
          // Execute the tool
          const result = await this.toolExecutor.execute({
            id: action.data.id,
            name: action.data.name,
            parameters: action.data.input
          });

          // Send tool result back to server
          if (this.dispatcher) {
            this.dispatcher.sendToolResult(result);
          }

          // Emit tool end event
          this.events.emit('tool-end', {
            type: 'tool-end',
            result
          });
          
          // Emit rendered tool call
          this.events.emit('text', {
            type: 'text',
            content: action.response,
            source: 'tool-call'
          });

          // Emit any file changes
          for (const change of action.changes) {
            this.events.emit('file-change', {
              type: 'file-change',
              change
            });
          }
        } catch (error) {
          this.events.emit('error', {
            type: 'error',
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
        break;

      case 'terminal-command-result':
        this.events.emit('text', {
          type: 'text',
          content: action.result,
          source: 'tool-result'
        });
        break;

      case 'response-complete':
        // Emit any final file changes
        for (const change of action.changes) {
          this.events.emit('file-change', {
            type: 'file-change',
            change
          });
        }
        break;

      case 'action-error':
        this.events.emit('error', {
          type: 'error',
          error: new Error(action.message)
        });
        break;

      case 'request-reconnect':
        // Let the WebSocketClient handle reconnection
        break;
    }
  }
}