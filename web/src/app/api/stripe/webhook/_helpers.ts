import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'

import type Stripe from 'stripe'

import { logger } from '@/util/logger'

/**
 * Checks whether a Stripe customer ID belongs to an organization.
 *
 * Uses `org.stripe_customer_id` which is set at org creation time, making it
 * reliable regardless of webhook ordering (unlike `stripe_subscription_id`
 * which may not be populated yet when early invoice events arrive).
 */
export async function isOrgCustomer(stripeCustomerId: string): Promise<boolean> {
  try {
    const orgs = await db
      .select({ id: schema.org.id })
      .from(schema.org)
      .where(eq(schema.org.stripe_customer_id, stripeCustomerId))
      .limit(1)
    return orgs.length > 0
  } catch (error) {
    logger.error(
      { stripeCustomerId, error },
      'Failed to check if customer is an org - defaulting to false',
    )
    return false
  }
}

/**
 * BILLING_DISABLED: Checks if a Stripe event is related to organization billing.
 * Used to reject org billing events while keeping personal billing working.
 */
export async function isOrgBillingEvent(event: Stripe.Event): Promise<boolean> {
  const eventData = event.data.object as unknown as Record<string, unknown>
  const metadata = (eventData.metadata || {}) as Record<string, string>

  // Check metadata for organization markers
  if (metadata.organization_id || metadata.organizationId) {
    return true
  }
  if (metadata.grantType === 'organization_purchase') {
    return true
  }

  // For invoice events, check if customer belongs to an org
  // (metadata.organizationId is already checked above in the generic metadata check)
  if (event.type.startsWith('invoice.')) {
    const customerId = eventData.customer
    if (customerId && typeof customerId === 'string') {
      return await isOrgCustomer(customerId)
    }
  }

  // For subscription events, check if customer is an org
  if (event.type.startsWith('customer.subscription.')) {
    const customerId = eventData.customer
    if (customerId && typeof customerId === 'string') {
      return await isOrgCustomer(customerId)
    }
  }

  return false
}
