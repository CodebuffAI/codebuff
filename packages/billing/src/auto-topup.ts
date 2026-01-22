import { env } from 'process'

import { CREDIT_PRICING } from '@codebuff/common/constants/limits'
import { convertCreditsToUsdCents } from '@codebuff/common/util/currency'
import { getNextQuotaReset } from '@codebuff/common/util/dates'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'

import {
  createPaymentIntent,
  fetchPaymentMethods,
  filterValidPaymentMethods,
  findValidPaymentMethod,
  getOrSetDefaultPaymentMethod,
} from './auto-topup-helpers'
import { calculateUsageAndBalance } from './balance-calculator'
import { processAndGrantCredit } from './grant-credits'
import {
  calculateOrganizationUsageAndBalance,
  grantOrganizationCredits,
} from './org-billing'
import { generateOperationIdTimestamp } from './utils'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type Stripe from 'stripe'

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

export async function validateAutoTopupStatus(params: {
  userId: string
  logger: Logger
}): Promise<AutoTopupValidationResult> {
  const { userId, logger } = params

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        stripe_customer_id: true,
      },
    })

    if (!user?.stripe_customer_id) {
      throw new AutoTopupValidationError(
        `You don't have a valid account with us. Please log in at ${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/login`,
      )
    }

    const allPaymentMethods = await fetchPaymentMethods(user.stripe_customer_id)
    const validPaymentMethod = findValidPaymentMethod(allPaymentMethods)

    if (!validPaymentMethod) {
      throw new AutoTopupValidationError(
        'You need a valid payment method to enable auto top-up. Try buying some credits!',
      )
    }

    return {
      blockedReason: null,
      validPaymentMethod,
    }
  } catch (error) {
    logger.error({ error }, 'Failed to validate auto top-up status')

    // Only disable auto-topup for permanent validation errors (missing customer, no payment method, expired card)
    // Don't disable for transient errors (Stripe API issues, network errors) to avoid false disables
    if (error instanceof AutoTopupValidationError) {
      await disableAutoTopup({ ...params, reason: error.message })
      return {
        blockedReason: error.message,
        validPaymentMethod: null,
      }
    }

    // For non-validation errors (e.g. Stripe API issues), return blocked but don't disable the setting
    // The user's auto-topup will be retried on the next trigger
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      blockedReason: `Unable to verify payment method status: ${errorMessage}`,
      validPaymentMethod: null,
    }
  }
}

async function disableAutoTopup(params: {
  userId: string
  reason: string
  logger: Logger
}) {
  const { userId, reason, logger } = params
  await db
    .update(schema.user)
    .set({ auto_topup_enabled: false })
    .where(eq(schema.user.id, userId))

  logger.info({ userId, reason }, 'Disabled auto top-up')
}

async function processAutoTopupPayment(params: {
  userId: string
  amountToTopUp: number
  stripeCustomerId: string
  paymentMethod: Stripe.PaymentMethod
  logger: Logger
}): Promise<void> {
  const { userId, amountToTopUp, stripeCustomerId, paymentMethod, logger } =
    params
  const logContext = { userId, amountToTopUp }

  // Generate a deterministic operation ID based on userId and current time to minute precision
  const timestamp = generateOperationIdTimestamp(new Date())
  const idempotencyKey = `auto-topup-${userId}-${timestamp}`
  const operationId = idempotencyKey

  const centsPerCredit = 1
  const amountInCents = convertCreditsToUsdCents(amountToTopUp, centsPerCredit)

  if (amountInCents <= 0) {
    throw new AutoTopupPaymentError('Invalid payment amount calculated')
  }

  const paymentIntent = await createPaymentIntent({
    amountInCents,
    stripeCustomerId,
    paymentMethodId: paymentMethod.id,
    description: `Auto top-up: ${amountToTopUp.toLocaleString()} credits`,
    idempotencyKey,
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

  await processAndGrantCredit({
    ...params,
    amount: amountToTopUp,
    type: 'purchase',
    description: `Auto top-up of ${amountToTopUp.toLocaleString()} credits`,
    expiresAt: null,
    operationId,
  })

  logger.info(
    {
      ...logContext,
      operationId,
      paymentIntentId: paymentIntent.id,
    },
    'Auto top-up payment succeeded and credits granted',
  )
}

export async function checkAndTriggerAutoTopup(params: {
  userId: string
  logger: Logger
}): Promise<number | undefined> {
  const { userId, logger } = params
  const logContext = { userId }

  try {
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

    const { balance } = await calculateUsageAndBalance({
      ...params,
      quotaResetDate: user.next_quota_reset ?? new Date(0),
    })

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
        `Auto top-up not needed for user ${userId}. Balance ${balance.totalRemaining} is above threshold ${user.auto_topup_threshold} and no debt.`,
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
        `Auto-top-up triggered but amount ${amountToTopUp} is less than minimum ${MINIMUM_PURCHASE_CREDITS}. Skipping top-up. Check user settings.`,
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
      `Auto-top-up needed for user ${userId}. Will attempt to purchase ${amountToTopUp} credits.`,
    )

    const { blockedReason, validPaymentMethod } =
      await validateAutoTopupStatus(params)

    if (blockedReason || !validPaymentMethod) {
      throw new AutoTopupValidationError(
        blockedReason || 'Auto top-up is not available.',
      )
    }

    try {
      await processAutoTopupPayment({
        ...params,
        amountToTopUp,
        stripeCustomerId: user.stripe_customer_id,
        paymentMethod: validPaymentMethod,
      })
      return amountToTopUp // Return the amount that was successfully added
    } catch (error) {
      // Only disable auto-topup for permanent payment errors (card declined, requires action)
      // Don't disable for transient errors (Stripe API issues, network errors)
      if (error instanceof AutoTopupPaymentError) {
        const message = error.message
        await disableAutoTopup({ ...params, reason: message })
        throw new Error(message)
      }

      // For transient errors, log but don't disable - will retry on next trigger
      logger.warn(
        { userId, error },
        'Auto top-up payment failed due to transient error, will retry on next trigger',
      )
      throw error
    }
  } catch (error) {
    logger.error(
      { ...logContext, error },
      `Error during auto-top-up check for user ${userId}`,
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

/**
 * Gets and selects the appropriate payment method for an organization.
 * Handles both card and link payment methods, with preference for existing default.
 */
async function getOrganizationPaymentMethod(params: {
  organizationId: string
  stripeCustomerId: string
  logger: Logger
}): Promise<string> {
  const { organizationId, stripeCustomerId, logger } = params
  const logContext = { organizationId, stripeCustomerId }

  const allPaymentMethods = await fetchPaymentMethods(stripeCustomerId)

  logger.debug(
    {
      ...logContext,
      totalPaymentMethodCount: allPaymentMethods.length,
      paymentMethodIds: allPaymentMethods.map((pm) => pm.id),
      paymentMethodTypes: allPaymentMethods.map((pm) => pm.type),
    },
    'Retrieved payment methods for organization',
  )

  if (allPaymentMethods.length === 0) {
    throw new AutoTopupPaymentError(
      'No payment methods available for organization',
    )
  }

  const validPaymentMethods = filterValidPaymentMethods(allPaymentMethods)

  if (validPaymentMethods.length === 0) {
    throw new AutoTopupPaymentError(
      'No valid (non-expired) payment methods available for organization',
    )
  }

  const { paymentMethodId } = await getOrSetDefaultPaymentMethod({
    stripeCustomerId,
    paymentMethods: validPaymentMethods,
    logger,
    logContext,
  })

  return paymentMethodId
}

async function processOrgAutoTopupPayment(params: {
  organizationId: string
  userId: string
  amountToTopUp: number
  stripeCustomerId: string
  logger: Logger
}): Promise<void> {
  const { organizationId, userId, amountToTopUp, stripeCustomerId, logger } =
    params
  const logContext = { organizationId, userId, amountToTopUp, stripeCustomerId }

  // Generate a deterministic operation ID based on organizationId and current time to minute precision
  const timestamp = generateOperationIdTimestamp(new Date())
  const idempotencyKey = `org-auto-topup-${organizationId}-${timestamp}`
  const operationId = idempotencyKey

  // Organizations use fixed pricing
  const amountInCents = amountToTopUp * CREDIT_PRICING.CENTS_PER_CREDIT

  if (amountInCents <= 0) {
    throw new AutoTopupPaymentError('Invalid payment amount calculated')
  }

  // Get the payment method to use for this organization
  const paymentMethodToUse = await getOrganizationPaymentMethod(params)

  const paymentIntent = await createPaymentIntent({
    amountInCents,
    stripeCustomerId,
    paymentMethodId: paymentMethodToUse,
    description: `Organization auto top-up: ${amountToTopUp.toLocaleString()} credits`,
    idempotencyKey,
    metadata: {
      organization_id: organizationId,
      credits: amountToTopUp.toString(),
      operationId,
      type: 'org-auto-topup',
    },
  })

  if (paymentIntent.status !== 'succeeded') {
    throw new AutoTopupPaymentError('Payment failed or requires action')
  }

  await grantOrganizationCredits({
    ...params,
    amount: amountToTopUp,
    operationId,
    description: `Organization auto top-up of ${amountToTopUp.toLocaleString()} credits`,
    expiresAt: null,
  })

  logger.info(
    {
      ...logContext,
      operationId,
      paymentIntentId: paymentIntent.id,
      paymentMethodId: paymentMethodToUse,
    },
    'Organization auto top-up payment succeeded and credits granted',
  )
}

interface OrgAutoTopupLogContext {
  organizationId: string
  userId: string
  currentBalance?: number
  threshold?: number | null
  amountToTopUp?: number
}

export async function checkAndTriggerOrgAutoTopup(params: {
  organizationId: string
  userId: string
  logger: Logger
}): Promise<void> {
  const { organizationId, userId, logger } = params
  const logContext: OrgAutoTopupLogContext = { organizationId, userId }

  try {
    const org = await getOrganizationSettings(organizationId)

    if (!org.auto_topup_enabled || !org.stripe_customer_id) {
      return
    }

    const { balance } = await calculateOrganizationUsageAndBalance({
      ...params,
      quotaResetDate: getNextQuotaReset(null),
    })

    if (balance.netBalance > (org.auto_topup_threshold || 0)) {
      logger.info(
        {
          ...logContext,
          currentBalance: balance.netBalance,
          threshold: org.auto_topup_threshold,
        },
        `Organization auto top-up not needed. Balance ${balance.netBalance} is above threshold ${org.auto_topup_threshold}.`,
      )
      return
    }

    const amountToTopUp = org.auto_topup_amount || 0

    if (amountToTopUp < MINIMUM_PURCHASE_CREDITS) {
      logger.warn(
        logContext,
        `Organization auto-top-up triggered but amount ${amountToTopUp} is less than minimum ${MINIMUM_PURCHASE_CREDITS}. Skipping top-up. Check organization settings.`,
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
      `Organization auto-top-up needed. Will attempt to purchase ${amountToTopUp} credits.`,
    )

    try {
      await processOrgAutoTopupPayment({
        ...params,
        amountToTopUp,
        stripeCustomerId: org.stripe_customer_id,
      })
    } catch (error) {
      logger.error(
        { ...logContext, error },
        'Organization auto top-up payment failed',
      )
      throw error
    }
  } catch (error) {
    logger.error(
      { ...logContext, error },
      `Error during organization auto-top-up check for ${organizationId}`,
    )
    throw error
  }
}
