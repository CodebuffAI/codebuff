import db from 'common/db';
import { eq } from 'drizzle-orm';
import { org } from 'common/db/schema';
import { stripeServer } from 'common/src/util/stripe';
import { logger } from 'common/src/util/logger'; // Assuming logger is available

/**
 * Synchronizes the organization's billing cycle with Stripe, updates the database,
 * and returns the start of the current cycle.
 */
export async function syncOrganizationBillingCycle(orgId: string): Promise<Date> {
  try {
    const organization = await db.query.org.findFirst({
      where: eq(org.id, orgId),
    });

    if (!organization) {
      logger.warn(`syncOrganizationBillingCycle: Organization with ID ${orgId} not found.`);
      // Fallback: first day of the current month
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (!organization.stripe_subscription_id) {
      logger.warn(`syncOrganizationBillingCycle: Organization ${orgId} has no stripe_subscription_id.`);
      // Fallback: use existing DB value if recent, otherwise first day of current month
      return getFallbackCycleStart(organization.current_period_start);
    }

    const subscription = await stripeServer.subscriptions.retrieve(
      organization.stripe_subscription_id
    );

    if (subscription && subscription.status === 'active') {
      const currentPeriodStart = new Date(subscription.current_period_start * 1000);
      const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

      // Update the database
      await db
        .update(org)
        .set({
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          updated_at: new Date(),
        })
        .where(eq(org.id, orgId));

      logger.info(
        `syncOrganizationBillingCycle: Synced billing cycle for org ${orgId}. New cycle start: ${currentPeriodStart.toISOString()}`
      );
      return currentPeriodStart;
    } else {
      logger.warn(
        `syncOrganizationBillingCycle: Stripe subscription ${organization.stripe_subscription_id} for org ${orgId} not found or not active. Status: ${subscription?.status}`
      );
      // Fallback: use existing DB value if recent, otherwise first day of current month
      return getFallbackCycleStart(organization.current_period_start);
    }
  } catch (error) {
    logger.error(
      { error, orgId },
      `syncOrganizationBillingCycle: Error synchronizing billing cycle for org ${orgId}.`
    );
    // Fallback in case of any error: first day of the current month
    // Consider if a more specific existing value should be returned from DB if available
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

function getFallbackCycleStart(dbCycleStart: Date | null): Date {
  const now = new Date();
  if (dbCycleStart) {
    // Check if the DB date is within the last 45 days
    const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    if (dbCycleStart > fortyFiveDaysAgo) {
      logger.info(`syncOrganizationBillingCycle: Using recent DB cycle start: ${dbCycleStart.toISOString()}`);
      return dbCycleStart;
    }
  }
  // Default to the first day of the current month
  const firstOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  logger.info(`syncOrganizationBillingCycle: Defaulting to first of current month: ${firstOfCurrentMonth.toISOString()}`);
  return firstOfCurrentMonth;
}
