import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { stripeServer } from 'common/util/stripe'
import { logger } from 'common/util/logger'
import { convertCreditsToUsdCents } from 'common/util/currency'
import { getUserCostPerCredit } from './conversion'
import type Stripe from 'stripe'
import { processAndGrantCredit } from './grant-credits'
import { calculateUsageAndBalance } from './balance-calculator'
import { generateOperationIdTimestamp } from './utils'
import { env } from 'common/src/env.mjs'
import { CREDIT_PRICING } from 'common/src/constants'
import { grantOrganizationCredits, calculateOrganizationUsageAndBalance } from './org-billing'
import { getNextQuotaReset } from 'common/util/dates'

const MINIMUM_PURCHASE_CREDITS = 500

export interface AutoTopupValidationResult {
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

  // Generate a deterministic operation ID based on userId and current time to minute precision
  const timestamp = generateOperationIdTimestamp(new Date())
  const idempotencyKey = `auto-topup-${userId}-${timestamp}`
  const operationId = idempotencyKey // Use same ID for both Stripe and our DB

  const centsPerCredit = await getUserCostPerCredit(userId)
  const amountInCents = convertCreditsToUsdCents(amountToTopUp, centsPerCredit)

  if (amountInCents <= 0) {
    throw new AutoTopupPaymentError('Invalid payment amount calculated')
  }

  const paymentIntent = await stripeServer.paymentIntents.create(
    {
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
    },
    {
      idempotencyKey, // Add Stripe idempotency key
    }
  )

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

export async function checkAndTriggerAutoTopup(
  userId: string
): Promise<number | undefined> {
  const logContext = { userId }

  try {
    // Get user info
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        auto_topup_enabled: true,
        auto_topup_threshold: true,
        auto_topup_amount: true,
        stripe_customer_id: true,
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
      return undefined
    }

    // Validate payment method
    const { blockedReason, validPaymentMethod } =
      await validateAutoTopupStatus(userId)

    if (blockedReason || !validPaymentMethod) {
      throw new Error(blockedReason || 'Auto top-up is not available.')
    }

    // Calculate balance
    const { balance } = await calculateUsageAndBalance(
      userId,
      user.next_quota_reset ?? new Date(0)
    )

    if (
      balance.totalRemaining >= user.auto_topup_threshold &&
      balance.totalDebt === 0
    ) {
      logger.info(
        {
          ...logContext,
          currentBalance: balance.totalRemaining,
          threshold: user.auto_topup_threshold,
          totalDebt: balance.totalDebt,
        },
        `Auto top-up not needed for user ${userId}. Balance ${balance.totalRemaining} is above threshold ${user.auto_topup_threshold} and no debt.`
      )
      return undefined
    }

    const amountToTopUp =
      balance.totalDebt > 0
        ? Math.max(user.auto_topup_amount, balance.totalDebt)
        : user.auto_topup_amount

    if (amountToTopUp < MINIMUM_PURCHASE_CREDITS) {
      logger.warn(
        logContext,
        `Auto-top-up triggered but amount ${amountToTopUp} is less than minimum ${MINIMUM_PURCHASE_CREDITS}. Skipping top-up. Check user settings.`
      )
      return undefined
    }

    logger.info(
      {
        ...logContext,
        currentBalance: balance.totalRemaining,
        currentDebt: balance.totalDebt,
        threshold: user.auto_topup_threshold,
        amountToTopUp,
      },
      `Auto-top-up needed for user ${userId}. Will attempt to purchase ${amountToTopUp} credits.`
    )

    try {
      await processAutoTopupPayment(
        userId,
        amountToTopUp,
        user.stripe_customer_id,
        validPaymentMethod
      )
      return amountToTopUp // Return the amount that was successfully added
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

async function getOrganizationSettings(organizationId: string) {
  const organization = await db.query.org.findFirst({
    where: eq(schema.org.id, organizationId),
    columns: {
      auto_topup_enabled: true,
      auto_topup_threshold: true,
      auto_topup_amount: true,
      stripe_customer_id: true,
    },
  })

  if (!organization) {
    throw new Error(`Organization ${organizationId} not found`)
  }

  return organization
}

async function processOrgAutoTopupPayment(
  organizationId: string,
  amountToTopUp: number,
  stripeCustomerId: string
): Promise<void> {
  const logContext = { organizationId, amountToTopUp }

  // Generate a deterministic operation ID based on organizationId and current time to minute precision
  const timestamp = generateOperationIdTimestamp(new Date())
  const idempotencyKey = `org-auto-topup-${organizationId}-${timestamp}`
  const operationId = idempotencyKey // Use same ID for both Stripe and our DB

  // Organizations use fixed pricing
  const amountInCents = amountToTopUp * CREDIT_PRICING.CENTS_PER_CREDIT

  if (amountInCents <= 0) {
    throw new AutoTopupPaymentError('Invalid payment amount calculated')
  }

  const paymentIntent = await stripeServer.paymentIntents.create(
    {
      amount: amountInCents,
      currency: 'usd',
      customer: stripeCustomerId,
      off_session: true,
      confirm: true,
      description: `Organization auto top-up: ${amountToTopUp.toLocaleString()} credits`,
      metadata: {
        organization_id: organizationId,
        credits: amountToTopUp.toString(),
        operationId,
        type: 'org-auto-topup',
      },
    },
    {
      idempotencyKey, // Add Stripe idempotency key
    }
  )

  if (paymentIntent.status !== 'succeeded') {
    throw new AutoTopupPaymentError('Payment failed or requires action')
  }

  // Use a system user ID for auto-topup since there's no specific user initiating this
  const systemUserId = 'system-auto-topup'
  
  await grantOrganizationCredits(
    organizationId,
    systemUserId,
    amountToTopUp,
    operationId,
    `Organization auto top-up of ${amountToTopUp.toLocaleString()} credits`,
    null
  )

  logger.info(
    {
      ...logContext,
      operationId,
      paymentIntentId: paymentIntent.id,
    },
    'Organization auto top-up payment succeeded and credits granted'
  )
}

export async function checkAndTriggerOrgAutoTopup(
  organizationId: string
): Promise<void> {
  const logContext = { organizationId }

  try {
    const org = await getOrganizationSettings(organizationId)

    if (!org.auto_topup_enabled || !org.stripe_customer_id) {
      return
    }

    const { balance } = await calculateOrganizationUsageAndBalance(
      organizationId,
      getNextQuotaReset(null)
    )

    if (balance.netBalance > (org.auto_topup_threshold || 0)) {
      logger.info(
        {
          ...logContext,
          currentBalance: balance.netBalance,
          threshold: org.auto_topup_threshold,
        },
        `Organization auto top-up not needed. Balance ${balance.netBalance} is above threshold ${org.auto_topup_threshold}.`
      )
      return
    }

    const amountToTopUp = org.auto_topup_amount || 0

    if (amountToTopUp < MINIMUM_PURCHASE_CREDITS) {
      logger.warn(
        logContext,
        `Organization auto-top-up triggered but amount ${amountToTopUp} is less than minimum ${MINIMUM_PURCHASE_CREDITS}. Skipping top-up. Check organization settings.`
      )
      return
    }

    logger.info(
      {
        ...logContext,
        currentBalance: balance.netBalance,
        threshold: org.auto_topup_threshold,
        amountToTopUp,
      },
      `Organization auto-top-up needed. Will attempt to purchase ${amountToTopUp} credits.`
    )

    try {
      await processOrgAutoTopupPayment(
        organizationId,
        amountToTopUp,
        org.stripe_customer_id
      )
    } catch (error) {
      // Auto-topup failures are automatically logged to sync_failures table
      // by the existing error handling in processOrgAutoTopupPayment
      logger.error(
        { ...logContext, error },
        'Organization auto top-up payment failed'
      )
      throw error
    }
  } catch (error) {
    logger.error(
      { ...logContext, error },
      `Error during organization auto-top-up check for ${organizationId}`
    )
    throw error
  }
}
