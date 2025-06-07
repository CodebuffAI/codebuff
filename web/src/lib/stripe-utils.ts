import { stripeServer, getCurrentSubscription } from '@codebuff/common/util/stripe'
import { env } from '@/env.mjs'
import type Stripe from 'stripe'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql } from 'drizzle-orm'
import { or, eq } from 'drizzle-orm'

export function getStripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof customer === 'string' ? customer : customer.id
}

export function getSubscriptionItemByType(
  subscription: Stripe.Subscription,
  usageType: 'licensed' | 'metered'
) {
  return subscription.items.data.find(
    (item) => item.price.recurring?.usage_type === usageType
  )
}

export async function checkForUnpaidInvoices(customerId: string) {
  const unpaidInvoices = await stripeServer.invoices.list({
    customer: customerId,
    status: 'open',
  })

  if (unpaidInvoices.data.length > 0) {
    return {
      error: {
        message:
          'You have unpaid invoices. Please check your email or contact support.',
      },
      status: 400,
    }
  }
  
  return null
}

export async function getTotalReferralCreditsForCustomer(
  customerId: string
): Promise<number> {
  return db
    .select({
      referralCredits: sql<string>`SUM(COALESCE(${schema.referral.credits}, 0))`,
    })
    .from(schema.user)
    .leftJoin(
      schema.referral,
      or(
        eq(schema.referral.referrer_id, schema.user.id),
        eq(schema.referral.referred_id, schema.user.id)
      )
    )
    .where(eq(schema.user.stripe_customer_id, customerId))
    .limit(1)
    .then((rows) => {
      const firstRow = rows[0]
      return parseInt(firstRow?.referralCredits ?? '0')
    })
}
