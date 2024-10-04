import { WebSocket } from 'ws'
import { ClientAction } from 'common/actions'

export class WebSocketMiddleware {
  private middlewares: Array<
    (
      action: ClientAction,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | Error>
  > = []

  use<T extends ClientAction['type']>(
    callback: (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | Error>
  ) {
    this.middlewares.push(
      callback as (
        action: ClientAction,
        clientSessionId: string,
        ws: WebSocket
      ) => Promise<void | Error>
    )
  }

  async execute(
    action: ClientAction,
    clientSessionId: string,
    ws: WebSocket
  ): Promise<boolean> {
    for (const middleware of this.middlewares) {
      const res = await middleware(action, clientSessionId, ws)
      if (res) {
        console.error('Middleware execution halted:', res)
        return false
      }
    }
    return true
  }

  run<T extends ClientAction['type']>(
    baseAction: (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => void
  ) {
    return async (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => {
      const shouldContinue = await this.execute(action, clientSessionId, ws)
      if (shouldContinue) {
        baseAction(action, clientSessionId, ws)
      }
    }
  }
}
