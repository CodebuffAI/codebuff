import { ClientAction, ServerAction } from 'common/actions'
import { WebSocket } from 'ws'

import { checkAuth } from '../util/check-auth'
import { logger, withLoggerContext } from '@/util/logger'
import { getUserInfoFromAuthToken, UserInfo } from './auth'
import { sendAction } from './websocket-action'
import {
  calculateUsageAndBalance,
  consumeCredits,
} from 'common/src/billing/balance-calculator'
import { getNextQuotaReset } from 'common/src/util/dates'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import {
  CREDITS_USAGE_LIMITS,
  CREDITS_REFERRAL_BONUS,
} from 'common/src/constants'
import {
  processAndGrantCredit,
  getPreviousFreeGrantAmount,
  calculateTotalReferralBonus,
} from 'common/src/billing/grant-credits'
import { checkAndTriggerAutoTopup } from 'common/src/billing/auto-topup'
import { generateCompactId } from 'common/util/string'
import { pluralize } from 'common/util/string'
import { getPlanFromPriceId, getMonthlyGrantForPlan } from '../billing/plans'

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

  // First check if we need to reset the quota
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      next_quota_reset: true,
      stripe_customer_id: true,
      stripe_price_id: true,
    },
  })

  if (user && user.next_quota_reset && user.next_quota_reset <= new Date()) {
    const currentResetDate = user.next_quota_reset
    const nextResetDate = getNextQuotaReset(user.next_quota_reset)
    const baseOperationIdSuffix = `-${userId}-${Date.now()}`

    // Update next reset date
    await db
      .update(schema.user)
      .set({
        next_quota_reset: nextResetDate,
      })
      .where(eq(schema.user.id, userId))

    try {
      // Get the amount for the grants
      const [freeGrantAmount, referralBonus] = await Promise.all([
        getPreviousFreeGrantAmount(userId),
        calculateTotalReferralBonus(userId),
      ])

      const grantsToProcess = []
      grantsToProcess.push(
        processAndGrantCredit(
          userId,
          freeGrantAmount,
          'free',
          `Monthly free grant`,
          nextResetDate, // Expires next cycle
          `free-${baseOperationIdSuffix}`
        )
      )

      // Add referral grant if amount > 0
      if (referralBonus > 0) {
        grantsToProcess.push(
          processAndGrantCredit(
            userId,
            referralBonus,
            'referral',
            `Monthly referral bonus grant based on history`,
            nextResetDate, // Expires next cycle
            `ref-${baseOperationIdSuffix}`
          )
        )
      }

      // Process grants only if there are any to process
      await Promise.all(grantsToProcess)
      logger.info(
        { userId, baseOperationIdSuffix, freeGrantAmount, referralBonus },
        'Monthly credit grants created.'
      )
    } catch (error) {
      logger.error({ userId, error }, 'Failed to create monthly credit grants.')
    }
  }

  const { usageThisCycle, balance } = await calculateUsageAndBalance(
    userId,
    user?.next_quota_reset ?? new Date(0)
  )

  // Calculate next monthly grant amount once since we use it in multiple places
  const nextMonthlyGrant = await getMonthlyGrantForPlan(
    getPlanFromPriceId(user?.stripe_price_id),
    userId
  )

  // Get user's auto top-up settings
  const userWithSettings = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      auto_topup_enabled: true,
      auto_topup_threshold: true,
    },
  })

  // Try auto top-up if balance falls below threshold
  if (userWithSettings?.auto_topup_enabled && 
      userWithSettings.auto_topup_threshold && 
      balance.totalRemaining < userWithSettings.auto_topup_threshold) {
    try {
      await checkAndTriggerAutoTopup(userId)
      // Get updated balance after potential auto top-up
      const newUsageAndBalance = await calculateUsageAndBalance(
        userId,
        user?.next_quota_reset ?? new Date(0)
      )

      // If auto-topup occurred, send updated usage info
      if (newUsageAndBalance.balance.totalRemaining > balance.totalRemaining) {
        const creditsAdded = newUsageAndBalance.balance.totalRemaining - balance.totalRemaining
        logger.info(
          {
            userId,
            newBalance: newUsageAndBalance.balance.totalRemaining,
            creditsAdded,
          },
          'Auto top-up successful'
        )

        // Send updated usage info with auto top-up details
        sendAction(ws, {
          type: 'usage-response',
          usage: newUsageAndBalance.usageThisCycle,
          remainingBalance: newUsageAndBalance.balance.totalRemaining,
          balanceBreakdown: newUsageAndBalance.balance.breakdown,
          next_quota_reset: user?.next_quota_reset ?? null,
          nextMonthlyGrant,
          autoTopupAdded: creditsAdded,
        })

        // Use new balance for subsequent checks
        balance.totalRemaining = newUsageAndBalance.balance.totalRemaining
        balance.totalDebt = newUsageAndBalance.balance.totalDebt
        balance.netBalance = newUsageAndBalance.balance.netBalance
      }
    } catch (error) {
      logger.error({ userId, error }, 'Error during auto top-up attempt')
      // Only return error if we don't have enough credits
      if (balance.totalRemaining <= 0) {
        return {
          type: 'action-error',
          error: 'Auto top-up disabled',
          message: `Auto top-up has been disabled due to a payment issue. Please check your payment method and re-enable auto top-up in your settings.`,
          remainingBalance: balance.totalRemaining,
        }
      }
    }
  }

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
    nextMonthlyGrant,
  })

  return undefined
})
