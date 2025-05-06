import { ClientEventMap, ClientEventType } from './types'

type EventHandler<T> = (event: T) => void;

export class EventEmitter {
  private handlers: Map<ClientEventType, Set<EventHandler<any>>> = new Map();

  emit<T extends ClientEventType>(
    type: T,
    event: ClientEventMap[T]
  ): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  on<T extends ClientEventType>(
    type: T,
    handler: EventHandler<ClientEventMap[T]>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(type);
        }
      }
    };
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}