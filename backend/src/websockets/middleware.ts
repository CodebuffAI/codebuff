import { WebSocket } from 'ws'
import { ClientAction, ServerAction } from 'common/actions'
import { sendAction } from './websocket-action'
import { checkAuth } from '../util/check-auth'
import { logger, withLoggerContext } from '@/util/logger'
import { getUserInfoFromAuthToken, UserInfo } from './auth'
import {
  calculateCurrentBalance,
} from 'common/src/billing/balance-calculator'
import { getNextQuotaReset } from 'common/src/util/dates'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import {
  CREDITS_USAGE_LIMITS,
  CREDITS_REFERRAL_BONUS,
} from 'common/src/constants'
import { processAndGrantCredit } from 'common/src/billing/grant-credits'
import { calculateAndApplyRollover } from 'common/src/billing/rollover-logic'

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

  // First check if we need to reset the quota
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      usage: true,
      next_quota_reset: true,
      stripe_customer_id: true,
    },
  })

  if (user && user.next_quota_reset && user.next_quota_reset <= new Date()) {
    const currentResetDate = user.next_quota_reset
    const nextResetDate = getNextQuotaReset(user.next_quota_reset)
    const baseOperationId = `reset-${userId}-${Date.now()}`

    // Calculate rollover first - this will also reset usage and update next_quota_reset
    await calculateAndApplyRollover(userId, currentResetDate)

    try {
      // Create both grants (local and Stripe if applicable)
      const freeGrantOpId = `${baseOperationId}-free`
      const referralGrantOpId = `${baseOperationId}-referral`
      await Promise.all([
        processAndGrantCredit(
          userId,
          CREDITS_USAGE_LIMITS.FREE,
          'free',
          `Monthly free grant`,
          nextResetDate,
          freeGrantOpId
        ),
        processAndGrantCredit(
          userId,
          CREDITS_REFERRAL_BONUS,
          'referral',
          `Monthly referral bonus grant`,
          nextResetDate,
          referralGrantOpId
        ),
      ])

      logger.info({ userId, baseOperationId }, 'Monthly credit grants created.')
    } catch (error) {
      logger.error({ userId, error }, 'Failed to create monthly credit grants.')
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
