import { WebSocket } from 'ws'
import { ClientAction, ServerAction } from 'common/actions'
import { sendAction } from './websocket-action'
import { checkAuth } from '../util/check-auth'
import { logger, withLoggerContext, LoggerContext } from '@/util/logger'
import { getUserInfoFromAuthToken } from './auth'

export class WebSocketMiddleware {
  private middlewares: Array<
    (
      action: ClientAction,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | ServerAction>
  > = []

  use<T extends ClientAction['type']>(
    callback: (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | ServerAction>
  ) {
    this.middlewares.push(
      callback as (
        action: ClientAction,
        clientSessionId: string,
        ws: WebSocket
      ) => Promise<void | ServerAction>
    )
  }

  async execute(
    action: ClientAction,
    clientSessionId: string,
    ws: WebSocket,
    options: { silent?: boolean } = {}
  ): Promise<boolean> {
    for (const middleware of this.middlewares) {
      const actionOrContinue = await middleware(action, clientSessionId, ws)
      if (actionOrContinue) {
        logger.warn(
          {
            action,
            middlewareResp: actionOrContinue,
            clientSessionId,
          },
          'Middleware execution halted.'
        )
        if (!options.silent) {
          sendAction(ws, actionOrContinue)
        }
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
    ) => void,
    options: { silent?: boolean } = {}
  ) {
    return async (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => {
      const userInfo =
        'authToken' in action
          ? await getUserInfoFromAuthToken(action.authToken!)
          : undefined

      return withLoggerContext(
        {
          clientSessionId,
          userId: userInfo?.id,
          userEmail: userInfo?.email,
          discordId: userInfo?.discord_id,
        },
        async () => {
          const shouldContinue = await this.execute(
            action,
            clientSessionId,
            ws,
            options
          )
          if (shouldContinue) {
            baseAction(action, clientSessionId, ws)
          }
        }
      )
    }
  }
}

export const protec = new WebSocketMiddleware()

protec.use(async (action, clientSessionId, ws) =>
  checkAuth({
    fingerprintId: 'fingerprintId' in action ? action.fingerprintId : undefined,
    authToken: 'authToken' in action ? action.authToken : undefined,
    clientSessionId,
  })
)
