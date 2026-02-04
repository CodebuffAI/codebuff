import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'

/**
 * Extracts the ID string from a Stripe expandable field.
 */
export function getStripeId(expandable: string | { id: string }): string {
  return typeof expandable === 'string' ? expandable : expandable.id
}

export const stripeServer = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  typescript: true,
})

export async function getCurrentSubscription(customerId: string) {
  const subscriptions = await stripeServer.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  })
  return subscriptions.data[0]
}

/**
 * Look up a user by their Stripe customer ID.
 */
export async function getUserByStripeCustomerId(
  stripeCustomerId: string,
): Promise<{
  id: string
  banned: boolean
  email: string
  name: string | null
} | null> {
  const users = await db
    .select({
      id: schema.user.id,
      banned: schema.user.banned,
      email: schema.user.email,
      name: schema.user.name,
    })
    .from(schema.user)
    .where(eq(schema.user.stripe_customer_id, stripeCustomerId))
    .limit(1)

  return users[0] ?? null
}
