import { calculateUsageAndBalance } from 'common/src/billing/balance-calculator'
import { logger } from '../util/logger'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

export class AutoTopupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoTopupValidationError'
  }
}

export class AutoTopupPaymentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoTopupPaymentError'
  }
}

export async function validateAutoTopupStatus(userId: string) {
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      auto_topup_enabled: true,
      auto_topup_threshold: true,
      auto_topup_amount: true,
      next_quota_reset: true,
    },
  })

  if (!user) {
    throw new AutoTopupValidationError('User not found')
  }

  if (!user.auto_topup_enabled) {
    return false
  }

  if (!user.auto_topup_threshold || !user.auto_topup_amount) {
    throw new AutoTopupValidationError('Auto top-up settings are incomplete')
  }

  const { balance } = await calculateUsageAndBalance(userId, user.next_quota_reset ?? new Date(0))

  if (balance.totalRemaining > user.auto_topup_threshold) {
    return false
  }

  return true
}

export async function disableAutoTopup(userId: string) {
  await db
    .update(schema.user)
    .set({
      auto_topup_enabled: false,
      auto_topup_threshold: null,
      auto_topup_amount: null,
    })
    .where(eq(schema.user.id, userId))

  logger.info({ userId }, 'Auto top-up disabled')
}

export async function processAutoTopupPayment(userId: string) {
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      auto_topup_enabled: true,
      auto_topup_threshold: true,
      auto_topup_amount: true,
      stripe_customer_id: true,
    },
  })

  if (!user?.auto_topup_enabled || !user.auto_topup_amount || !user.stripe_customer_id) {
    throw new AutoTopupValidationError('Invalid auto top-up configuration')
  }

  // TODO: Implement Stripe payment processing
  throw new Error('Not implemented')
}

export async function checkAndTriggerAutoTopup(userId: string) {
  try {
    const shouldTopUp = await validateAutoTopupStatus(userId)
    if (!shouldTopUp) {
      return
    }

    await processAutoTopupPayment(userId)
  } catch (error) {
    if (error instanceof AutoTopupValidationError) {
      logger.warn({ userId, error: error.message }, 'Auto top-up validation failed')
      await disableAutoTopup(userId)
    } else {
      logger.error({ userId, error }, 'Auto top-up processing failed')
      throw error
    }
  }
}