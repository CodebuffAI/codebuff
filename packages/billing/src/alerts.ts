import db from 'common/db';
import { eq } from 'drizzle-orm';
import { org as orgSchema } from 'common/db/schema'; // Assuming schema.org is aliased as orgSchema
import { OrganizationAlert } from 'common/src/types/organization';
import { calculateOrganizationUsageAndBalance, CreditUsageAndBalance } from './balance-calculator';
import { syncOrganizationBillingCycle } from './billing-cycle'; // To get the current cycle start

// --- Alert Configuration ---
const LOW_BALANCE_THRESHOLD_WARNING = 200; // Credits
const CRITICAL_BALANCE_THRESHOLD = 0; // Credits (i.e., netBalance <= 0)

const HIGH_USAGE_THRESHOLD_ABSOLUTE = 10000; // Credits used in cycle
const HIGH_USAGE_REMAINING_RATIO = 0.20; // If balance is less than 20% of cycle usage

const AUTO_TOPUP_LOW_BALANCE_INFO_THRESHOLD_OFFSET = 50; // Show info if balance is X credits above actual auto-topup threshold

/**
 * Fetches and generates alerts for an organization based on its billing status.
 */
export async function getOrganizationAlerts(orgId: string): Promise<OrganizationAlert[]> {
  const alerts: OrganizationAlert[] = [];
  const now = new Date();

  try {
    const organization = await db.query.org.findFirst({
      where: eq(orgSchema.id, orgId),
    });

    if (!organization) {
      console.warn(`getOrganizationAlerts: Organization with ID ${orgId} not found.`);
      // Potentially return a specific "org_not_found" alert or handle upstream
      return [];
    }

    // Ensure we have the latest billing cycle information
    const cycleStartDate = await syncOrganizationBillingCycle(orgId);
    const usageAndBalance: CreditUsageAndBalance = await calculateOrganizationUsageAndBalance(orgId, cycleStartDate, now);
    const { balance, usageThisCycle } = usageAndBalance;

    // --- Generate Alerts Based on Conditions ---

    // 1. Critical Low Balance / Credit Limit Reached Alert
    if (balance.netBalance <= CRITICAL_BALANCE_THRESHOLD) {
      alerts.push({
        id: `org_${orgId}_credit_limit_reached_${now.getTime()}`,
        type: 'credit_limit_reached',
        message: balance.totalDebt > 0
          ? `Your organization has a debt of ${balance.totalDebt.toLocaleString()} credits. Services may be interrupted.`
          : "Your organization has run out of credits. Services may be at risk.",
        timestamp: now,
        severity: 'critical',
      });
    }
    // 2. Low Balance Warning (only if not already critical)
    else if (balance.netBalance < LOW_BALANCE_THRESHOLD_WARNING) {
      alerts.push({
        id: `org_${orgId}_low_balance_${now.getTime()}`,
        type: 'low_balance',
        message: `Your organization's credit balance is low (${balance.netBalance.toLocaleString()} credits remaining).`,
        timestamp: now,
        severity: 'warning',
      });
    }

    // 3. High Usage Alert
    if (usageThisCycle > HIGH_USAGE_THRESHOLD_ABSOLUTE && balance.netBalance < usageThisCycle * HIGH_USAGE_REMAINING_RATIO) {
      alerts.push({
        id: `org_${orgId}_high_usage_${now.getTime()}`,
        type: 'high_usage',
        message: `Your organization has used ${usageThisCycle.toLocaleString()} credits this cycle, and your remaining balance (${balance.netBalance.toLocaleString()}) is less than 25% of this usage.`,
        timestamp: now,
        severity: 'warning',
      });
    }

    // 4. Auto Top-up Related Alerts
    if (organization.auto_topup_enabled) {
      if (!organization.stripe_subscription_id) {
        alerts.push({
          id: `org_${orgId}_auto_topup_config_error_${now.getTime()}`,
          type: 'auto_topup_failed', // Using 'auto_topup_failed' as per frontend, though it's a config error
          message: "Auto top-up is enabled, but the organization's billing information (subscription) is not fully set up. Auto top-up will not function.",
          timestamp: now,
          severity: 'error', // 'error' for config issues, 'critical' for actual payment failure
        });
      } else if (organization.auto_topup_threshold && balance.netBalance < (organization.auto_topup_threshold + AUTO_TOPUP_LOW_BALANCE_INFO_THRESHOLD_OFFSET)) {
        // This alert informs that the balance is near/below the threshold where auto-topup would trigger.
        // It's not strictly a "failure" but an informational alert about auto-topup status.
        alerts.push({
          id: `org_${orgId}_auto_topup_threshold_info_${now.getTime()}`,
          type: 'auto_topup_threshold_reached', // A more specific type might be good
          message: `Your organization's balance (${balance.netBalance.toLocaleString()} credits) is near or below the auto top-up threshold of ${organization.auto_topup_threshold.toLocaleString()} credits.`,
          timestamp: now,
          severity: 'info',
        });
      }
    }
    // TODO: Consider an alert if auto_topup_enabled is false but balance is very low/negative, suggesting to enable it.

    return alerts;

  } catch (error) {
    console.error(`Error in getOrganizationAlerts for orgId ${orgId}:`, error);
    // Return a generic error alert or an empty array
    return [
      {
        id: `org_${orgId}_alert_system_error_${now.getTime()}`,
        type: 'system_error',
        message: 'There was an error fetching organization billing alerts. Please try again later.',
        timestamp: now,
        severity: 'error',
      }
    ];
  }
}
