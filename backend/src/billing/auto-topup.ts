import { calculateUsageAndBalance } from 'common/src/billing/balance-calculator'
import { logger } from '@/util/logger'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { stripeServer } from 'common/src/util/stripe'
import { processAndGrantCredit } from 'common/src/billing/grant-credits'
import { generateCompactId } from 'common/src/util/string'
import { convertCreditsToUsdCents, getUserCostPerCredit } from 'common/src/billing/credit-conversion'
import { validateAutoTopupStatus, AutoTopupValidationError, disableAutoTopup } from 'common/src/billing/auto-topup'
import type Stripe from 'stripe'
import { env } from '@/env.mjs'

const MINIMUM_PURCHASE_CREDITS = 500

export class AutoTopupPaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoTopupPaymentError'
  }
}

async function processAutoTopupPayment(
  userId: string,
  amountToTopUp: number,
  stripeCustomerId: string,
  paymentMethod: Stripe.PaymentMethod
): Promise<void> {
  const logContext = { userId, amountToTopUp }
  const operationId = `auto-${userId}-${generateCompactId()}`

  const centsPerCredit = await getUserCostPerCredit(userId)
  const amountInCents = convertCreditsToUsdCents(amountToTopUp, centsPerCredit)

  if (amountInCents <= 0) {
    throw new AutoTopupPaymentError('Invalid payment amount calculated')
  }

  const paymentIntent = await stripeServer.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    customer: stripeCustomerId,
    payment_method: paymentMethod.id,
    off_session: true,
    confirm: true,
    description: `Auto top-up: ${amountToTopUp.toLocaleString()} credits`,
    metadata: {
      userId,
      credits: amountToTopUp.toString(),
      operationId,
      grantType: 'purchase',
      type: 'auto-topup',
    },
  })

  if (paymentIntent.status !== 'succeeded') {
    throw new AutoTopupPaymentError('Payment failed or requires action')
  }

  await processAndGrantCredit(
    userId,
    amountToTopUp,
    'purchase',
    `Auto top-up of ${amountToTopUp.toLocaleString()} credits`,
    null,
    operationId
  )

  logger.info(
    {
      ...logContext,
      operationId,
      paymentIntentId: paymentIntent.id,
    },
    'Auto top-up payment succeeded and credits granted'
  )
}

export async function checkAndTriggerAutoTopup(userId: string): Promise<void> {
  const logContext = { userId }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        id: true,
        stripe_customer_id: true,
        auto_topup_enabled: true,
        auto_topup_threshold: true,
        auto_topup_amount: true,
        next_quota_reset: true,
      },
    })

    if (
      !user ||
      !user.auto_topup_enabled ||
      user.auto_topup_threshold === null ||
      user.auto_topup_amount === null ||
      !user.stripe_customer_id
    ) {
      return
    }

    const { blockedReason, validPaymentMethod } =
      await validateAutoTopupStatus(userId, env.NEXT_PUBLIC_APP_URL)

    if (blockedReason || !validPaymentMethod) {
      throw new Error(blockedReason || 'Auto top-up is not available.')
    }

    const { balance } = await calculateUsageAndBalance(userId, user.next_quota_reset ?? new Date(0))
    
    if (balance.totalRemaining >= user.auto_topup_threshold && balance.totalDebt === 0) {
      return
    }

    const amountToTopUp = balance.totalDebt > 0
      ? Math.max(user.auto_topup_amount, balance.totalDebt)
      : user.auto_topup_amount

    if (amountToTopUp < MINIMUM_PURCHASE_CREDITS) {
      logger.warn(
        logContext,
        `Auto-top-up triggered but amount ${amountToTopUp} is less than minimum ${MINIMUM_PURCHASE_CREDITS}. Skipping top-up. Check user settings.`
      )
      return
    }

    logger.info(
      {
        ...logContext,
        currentBalance: balance.totalRemaining,
        currentDebt: balance.totalDebt,
        threshold: user.auto_topup_threshold,
        amountToTopUp,
      },
      `Auto-top-up triggered for user ${userId}. Attempting to purchase ${amountToTopUp} credits.`
    )

    try {
      await processAutoTopupPayment(
        userId,
        amountToTopUp,
        user.stripe_customer_id,
        validPaymentMethod
      )
    } catch (error) {
      const message =
        error instanceof AutoTopupPaymentError
          ? error.message
          : 'Payment failed. Please check your payment method and re-enable auto top-up.'

      await disableAutoTopup(userId)
      throw new Error(message)
    }
  } catch (error) {
    logger.error(
      { ...logContext, error },
      `Error during auto-top-up check for user ${userId}`
    )
    throw error
  }
}