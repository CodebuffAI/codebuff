import db from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import { stripeServer } from '../util/stripe'
import { logger } from '../util/logger'
import { processAndGrantCredit } from './grant-credits'
import { calculateCurrentBalance } from './balance-calculator'
import { convertCreditsToUsdCents, getUserCostPerCredit } from './conversion'
import { generateCompactId } from '../util/string'
import type Stripe from 'stripe'
import { env } from 'src/env.mjs'

const MINIMUM_PURCHASE_CREDITS = 500

interface AutoTopupValidationResult {
  blockedReason: string | null
  validPaymentMethod: Stripe.PaymentMethod | null
}

class AutoTopupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoTopupValidationError'
  }
}

class AutoTopupPaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoTopupPaymentError'
  }
}

export async function validateAutoTopupStatus(
  userId: string
): Promise<AutoTopupValidationResult> {
  const logContext = { userId }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        stripe_customer_id: true,
      },
    })

    if (!user?.stripe_customer_id) {
      throw new AutoTopupValidationError(
        `You don't have a valid account with us. Please log in at ${env.NEXT_PUBLIC_APP_URL}/login`
      )
    }

    const paymentMethods = await stripeServer.paymentMethods.list({
      customer: user.stripe_customer_id,
      type: 'card',
    })

    const validPaymentMethod = paymentMethods.data.find(
      (pm) =>
        pm.card?.exp_year &&
        pm.card.exp_month &&
        new Date(pm.card.exp_year, pm.card.exp_month - 1) > new Date()
    )

    if (!validPaymentMethod) {
      throw new AutoTopupValidationError(
        'You need a valid payment method to enable auto top-up. Try buying some credits!'
      )
    }

    return {
      blockedReason: null,
      validPaymentMethod,
    }
  } catch (error) {
    const blockedReason =
      error instanceof AutoTopupValidationError
        ? error.message
        : 'Unable to verify payment method status.'

    await disableAutoTopup(userId, blockedReason)

    return {
      blockedReason,
      validPaymentMethod: null,
    }
  }
}

async function disableAutoTopup(userId: string, reason: string) {
  await db
    .update(schema.user)
    .set({ auto_topup_enabled: false })
    .where(eq(schema.user.id, userId))

  logger.info({ userId, reason }, 'Disabled auto top-up')
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
      await validateAutoTopupStatus(userId)

    if (blockedReason || !validPaymentMethod) {
      throw new Error(blockedReason || 'Auto top-up is not available.')
    }

    const currentBalance = await calculateCurrentBalance(userId)
    if (currentBalance.totalRemaining >= user.auto_topup_threshold) {
      return
    }

    const amountToTopUp = user.auto_topup_amount

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
        currentBalance: currentBalance.totalRemaining,
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

      await disableAutoTopup(userId, message)
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
