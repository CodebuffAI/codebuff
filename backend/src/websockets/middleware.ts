import { WebSocket } from 'ws'
import { ClientAction, ServerAction } from 'common/actions'
import { sendAction } from './websocket-action'
import { checkAuth } from '../util/check-auth'
import { logger, withLoggerContext, LoggerContext } from '@/util/logger'
import { getUserInfoFromAuthToken, UserInfo } from './auth'
import { calculateCurrentBalance } from 'common/src/billing/balance-calculator'

type MiddlewareCallback = (
  action: ClientAction,
  clientSessionId: string,
  ws: WebSocket,
  userInfo: UserInfo | undefined
) => Promise<void | ServerAction>

export class WebSocketMiddleware {
  private middlewares: Array<MiddlewareCallback> = []

  use<T extends ClientAction['type']>(
    callback: (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket,
      userInfo: UserInfo | undefined
    ) => Promise<void | ServerAction>
  ) {
    this.middlewares.push(callback as MiddlewareCallback)
  }

  async execute(
    action: ClientAction,
    clientSessionId: string,
    ws: WebSocket,
    options: { silent?: boolean } = {}
  ): Promise<boolean> {
    const userInfo =
      'authToken' in action && action.authToken
        ? await getUserInfoFromAuthToken(action.authToken)
        : undefined

    return await withLoggerContext(
      {
        clientSessionId,
        userId: userInfo?.id,
        userEmail: userInfo?.email,
        discordId: userInfo?.discord_id,
      },
      async () => {
        for (const middleware of this.middlewares) {
          const actionOrContinue = await middleware(
            action,
            clientSessionId,
            ws,
            userInfo
          )
          if (actionOrContinue) {
            logger.warn(
              {
                actionType: action.type,
                middlewareResp: actionOrContinue.type,
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
    )
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
  }
}

export const protec = new WebSocketMiddleware()

protec.use(async (action, clientSessionId, ws, userInfo) =>
  checkAuth({
    fingerprintId: 'fingerprintId' in action ? action.fingerprintId : undefined,
    authToken: 'authToken' in action ? action.authToken : undefined,
    clientSessionId,
  })
)

protec.use(async (action, clientSessionId, ws, userInfo) => {
  const userId = userInfo?.id
  const fingerprintId =
    'fingerprintId' in action ? action.fingerprintId : 'unknown-fingerprint'

  if (!userId || !fingerprintId) {
    logger.warn(
      {
        userId,
        fingerprintId,
        actionType: action.type,
      },
      'Missing user or fingerprint ID'
    )
    return {
      type: 'action-error',
      error: 'Missing user or fingerprint ID',
      message: 'Please log in to continue.',
    }
  }

  const { totalRemaining } = await calculateCurrentBalance(userId)

  if (totalRemaining <= 0) {
    logger.warn(
      {
        userId,
        fingerprintId,
        remaining: totalRemaining,
        actionType: action.type,
      },
      'Insufficient credits for action'
    )
    return {
      type: 'action-error',
      error: 'Insufficient credits',
      message: `You do not have enough credits for this action. Please upgrade your plan or wait for your credits to reset.`,
      remainingBalance: totalRemaining,
    }
  }

  return undefined
})
