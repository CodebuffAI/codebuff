import { WebSocket } from 'ws'
import { ClientAction } from 'common/actions'

export class WebSocketMiddleware {
  private middlewares: Array<
    (action: ClientAction, ws: WebSocket) => void | Promise<void>
  > = []

  use<T extends ClientAction['type']>(
    callback: (
      action: Extract<ClientAction, { type: T }>,
      ws: WebSocket
    ) => void | Promise<void>
  ) {
    this.middlewares.push(
      callback as (action: ClientAction, ws: WebSocket) => void | Promise<void>
    )
  }

  async execute(action: ClientAction, ws: WebSocket): Promise<boolean> {
    try {
      for (const middleware of this.middlewares) {
        await middleware(action, ws)
      }
      return true
    } catch (error) {
      console.error('Middleware execution halted:', error)
      return false
    }
  }

  run<T extends ClientAction['type']>(
    baseAction: (
      action: Extract<ClientAction, { type: T }>,
      ws: WebSocket
    ) => void
  ) {
    return async (
      action: Extract<ClientAction, { type: T }>,
      ws: WebSocket
    ) => {
      const shouldContinue = await this.execute(action, ws)
      if (shouldContinue) {
        baseAction(action, ws)
      }
    }
  }
}
