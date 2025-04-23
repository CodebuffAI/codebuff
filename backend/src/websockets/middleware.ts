import { ClientAction, ServerAction } from 'common/actions'
import { WebSocket } from 'ws'

import { checkAuth } from '../util/check-auth'
import { logger, withLoggerContext } from '@/util/logger'
import { getUserInfoFromAuthToken, UserInfo } from './auth'
import { sendAction } from './websocket-action'
import { calculateUsageAndBalance } from 'common/src/billing/balance-calculator'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { triggerMonthlyResetAndGrant } from 'common/src/billing/grant-credits'
import { checkAndTriggerAutoTopup } from 'common/src/billing/auto-topup'
import { pluralize } from 'common/util/string'

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
        discordId: userInfo?.discord_id ?? undefined,
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
      const userInfo =
        'authToken' in action
          ? await getUserInfoFromAuthToken(action.authToken!)
          : undefined

      return withLoggerContext(
        {
          clientSessionId,
          userId: userInfo?.id,
          userEmail: userInfo?.email,
          discordId: userInfo?.discord_id ?? undefined,
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

  // Get user info for balance calculation
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      next_quota_reset: true,
      stripe_customer_id: true,
    },
  })

  // Check and trigger monthly reset if needed
  await triggerMonthlyResetAndGrant(userId)

  // Check if we need to trigger auto top-up
  try {
    await checkAndTriggerAutoTopup(userId)
  } catch (error) {
    logger.error(
      { error, userId, clientSessionId },
      'Error during auto top-up check in middleware'
    )
    // Continue execution to check remaining balance
  }

  const { usageThisCycle, balance } = await calculateUsageAndBalance(
    userId,
    user?.next_quota_reset ?? new Date(0)
  )

  // Check if we have enough remaining credits
  if (balance.totalRemaining <= 0) {
    // If they have debt, show that in the message
    const message =
      balance.totalDebt > 0
        ? `You have a balance of negative ${pluralize(Math.abs(balance.totalDebt), 'credit')}. Please add credits to continue using Codebuff.`
        : `You do not have enough credits for this action. Please add credits or wait for your next cycle to begin.`

    return {
      type: 'action-error',
      error: 'Insufficient credits',
      message,
      remainingBalance: balance.netBalance,
    }
  }

  // Send initial usage info if we have sufficient credits
  sendAction(ws, {
    type: 'usage-response',
    usage: usageThisCycle,
    remainingBalance: balance.totalRemaining,
    balanceBreakdown: balance.breakdown,
    next_quota_reset: user?.next_quota_reset ?? null,
  })

  return undefined
})
