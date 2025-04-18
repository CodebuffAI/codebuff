import { logger } from '../util/logger'
import db from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import { stripeServer } from '../util/stripe'
import type Stripe from 'stripe'

interface AutoTopupValidationResult {
  blockedReason: string | null
  validPaymentMethod: Stripe.PaymentMethod | null
}

export class AutoTopupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoTopupValidationError'
  }
}

export async function validateAutoTopupStatus(
  userId: string,
  appUrl: string
): Promise<AutoTopupValidationResult> {
  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        stripe_customer_id: true,
      },
    })

    if (!user?.stripe_customer_id) {
      throw new AutoTopupValidationError(
        `You don't have a valid account with us. Please log in at ${appUrl}/login`
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

    await disableAutoTopup(userId)

    return {
      blockedReason,
      validPaymentMethod: null,
    }
  }
}

export async function disableAutoTopup(userId: string) {
  await db
    .update(schema.user)
    .set({ auto_topup_enabled: false })
    .where(eq(schema.user.id, userId))

  logger.info({ userId }, 'Disabled auto top-up')
}