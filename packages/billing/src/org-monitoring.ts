import { logger } from 'common/util/logger'
import { trackEvent } from 'common/analytics'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { calculateOrganizationUsageAndBalance } from './org-billing'
import { getNextQuotaReset } from 'common/util/dates'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

export interface OrganizationCreditAlert {
  organizationId: string
  organizationName?: string
  alertType: 'low_balance' | 'high_usage' | 'failed_consumption' | 'billing_setup_required'
  currentBalance?: number
  threshold?: number
  usageAmount?: number
  error?: string
  metadata?: Record<string, any>
}

export interface OrganizationUsageMetrics {
  organizationId: string
  totalCreditsConsumed: number
  uniqueUsers: number
  repositoryCount: number
  averageCreditsPerUser: number
  topRepository: string
  timeframe: 'daily' | 'weekly' | 'monthly'
}

export interface OrganizationAlert {
  id: string
  type: 'low_balance' | 'high_usage' | 'auto_topup_failed' | 'credit_limit_reached'
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * Gets organization alerts for UI display
 */
export async function getOrganizationAlerts(
  organizationId: string
): Promise<OrganizationAlert[]> {
  const alerts: OrganizationAlert[] = []

  try {
    // Get organization settings
    const organization = await db.query.org.findFirst({
      where: eq(schema.org.id, organizationId),
    })

    if (!organization) {
      return alerts
    }

    // Check current balance
    const now = new Date()
    const quotaResetDate = getNextQuotaReset(now)
    const { balance, usageThisCycle } = await calculateOrganizationUsageAndBalance(
      organizationId,
      quotaResetDate,
      now
    )

    // Low balance alert
    if (organization.billing_alerts && balance.netBalance < 500) {
      alerts.push({
        id: `low-balance-${organizationId}`,
        type: 'low_balance',
        severity: balance.netBalance < 100 ? 'critical' : 'warning',
        title: 'Low Credit Balance',
        message: `Organization has ${balance.netBalance} credits remaining`,
        timestamp: new Date()
      })
    }

    // High usage alert
    if (organization.usage_alerts && usageThisCycle > 5000) {
      alerts.push({
        id: `high-usage-${organizationId}`,
        type: 'high_usage',
        severity: 'info',
        title: 'High Usage This Cycle',
        message: `Organization has used ${usageThisCycle} credits this billing cycle`,
        timestamp: new Date()
      })
    }

    // Credit limit alert
    if (organization.credit_limit && usageThisCycle >= organization.credit_limit * 0.9) {
      alerts.push({
        id: `credit-limit-${organizationId}`,
        type: 'credit_limit_reached',
        severity: usageThisCycle >= organization.credit_limit ? 'critical' : 'warning',
        title: 'Credit Limit Approaching',
        message: `Organization has used ${usageThisCycle} of ${organization.credit_limit} credits this month (${Math.round((usageThisCycle / organization.credit_limit) * 100)}%)`,
        timestamp: new Date()
      })
    }

    // Note: Auto-topup failures are already tracked in the sync_failures table
    // No need for additional database schema updates for this functionality

    return alerts
  } catch (error) {
    logger.error(
      { organizationId, error },
      'Error generating organization alerts'
    )
    return alerts
  }
}

/**
 * Sends alerts for organization credit issues
 */
export async function sendOrganizationAlert(alert: OrganizationCreditAlert): Promise<void> {
  try {
    // Log the alert
    logger.warn(
      {
        organizationId: alert.organizationId,
        alertType: alert.alertType,
        currentBalance: alert.currentBalance,
        threshold: alert.threshold,
        usageAmount: alert.usageAmount,
        error: alert.error,
        metadata: alert.metadata,
      },
      `Organization alert: ${alert.alertType}`
    )

    // Track analytics event
    trackEvent(AnalyticsEvent.CREDIT_GRANT, alert.organizationId, {
      alertType: alert.alertType,
      currentBalance: alert.currentBalance,
      threshold: alert.threshold,
    })

    // TODO: Implement actual alerting mechanisms:
    // - Email notifications to organization owners
    // - Slack/Discord webhooks
    // - Dashboard notifications
    // - SMS alerts for critical issues

    switch (alert.alertType) {
      case 'low_balance':
        await handleLowBalanceAlert(alert)
        break
      case 'high_usage':
        await handleHighUsageAlert(alert)
        break
      case 'failed_consumption':
        await handleFailedConsumptionAlert(alert)
        break
      case 'billing_setup_required':
        await handleBillingSetupAlert(alert)
        break
    }
  } catch (error) {
    logger.error(
      { alert, error },
      'Failed to send organization alert'
    )
  }
}

async function handleLowBalanceAlert(alert: OrganizationCreditAlert): Promise<void> {
  // TODO: Send email to organization owners about low balance
  // TODO: Suggest auto-topup or manual credit purchase
  logger.info(
    { organizationId: alert.organizationId, balance: alert.currentBalance },
    'Low balance alert sent to organization owners'
  )
}

async function handleHighUsageAlert(alert: OrganizationCreditAlert): Promise<void> {
  // TODO: Send usage spike notification
  // TODO: Provide usage breakdown and recommendations
  logger.info(
    { organizationId: alert.organizationId, usage: alert.usageAmount },
    'High usage alert sent to organization admins'
  )
}

async function handleFailedConsumptionAlert(alert: OrganizationCreditAlert): Promise<void> {
  // TODO: Send immediate notification about failed credit consumption
  // TODO: Provide troubleshooting steps
  logger.error(
    { organizationId: alert.organizationId, error: alert.error },
    'Failed consumption alert sent to organization owners'
  )
}

async function handleBillingSetupAlert(alert: OrganizationCreditAlert): Promise<void> {
  // TODO: Send setup reminder to organization owners
  // TODO: Provide setup instructions and links
  logger.info(
    { organizationId: alert.organizationId },
    'Billing setup reminder sent to organization owners'
  )
}

/**
 * Monitors organization credit consumption and sends alerts when needed
 */
export async function monitorOrganizationCredits(
  organizationId: string,
  currentBalance: number,
  recentUsage: number,
  organizationName?: string
): Promise<void> {
  const LOW_BALANCE_THRESHOLD = 100 // Credits
  const HIGH_USAGE_THRESHOLD = 1000 // Credits per day

  try {
    // Check for low balance
    if (currentBalance < LOW_BALANCE_THRESHOLD) {
      await sendOrganizationAlert({
        organizationId,
        organizationName,
        alertType: 'low_balance',
        currentBalance,
        threshold: LOW_BALANCE_THRESHOLD,
      })
    }

    // Check for high usage
    if (recentUsage > HIGH_USAGE_THRESHOLD) {
      await sendOrganizationAlert({
        organizationId,
        organizationName,
        alertType: 'high_usage',
        usageAmount: recentUsage,
        threshold: HIGH_USAGE_THRESHOLD,
      })
    }

    // Check for negative balance (debt)
    if (currentBalance < 0) {
      await sendOrganizationAlert({
        organizationId,
        organizationName,
        alertType: 'failed_consumption',
        currentBalance,
        error: 'Organization has negative credit balance',
      })
    }
  } catch (error) {
    logger.error(
      { organizationId, error },
      'Error monitoring organization credits'
    )
  }
}

/**
 * Tracks organization usage metrics for analytics
 */
export async function trackOrganizationUsageMetrics(
  metrics: OrganizationUsageMetrics
): Promise<void> {
  try {
    logger.info(
      {
        organizationId: metrics.organizationId,
        totalCreditsConsumed: metrics.totalCreditsConsumed,
        uniqueUsers: metrics.uniqueUsers,
        repositoryCount: metrics.repositoryCount,
        averageCreditsPerUser: metrics.averageCreditsPerUser,
        topRepository: metrics.topRepository,
        timeframe: metrics.timeframe,
      },
      'Organization usage metrics tracked'
    )

    // Track analytics event
    trackEvent(AnalyticsEvent.CREDIT_GRANT, metrics.organizationId, {
      type: 'usage_metrics',
      timeframe: metrics.timeframe,
      totalCreditsConsumed: metrics.totalCreditsConsumed,
      uniqueUsers: metrics.uniqueUsers,
      repositoryCount: metrics.repositoryCount,
    })

    // TODO: Store metrics in time-series database for dashboards
    // TODO: Generate usage reports
    // TODO: Identify usage patterns and optimization opportunities
  } catch (error) {
    logger.error(
      { metrics, error },
      'Failed to track organization usage metrics'
    )
  }
}

/**
 * Validates organization billing health
 */
export async function validateOrganizationBillingHealth(
  organizationId: string
): Promise<{
  healthy: boolean
  issues: string[]
  recommendations: string[]
}> {
  const issues: string[] = []
  const recommendations: string[] = []

  try {
    // TODO: Implement comprehensive health checks:
    // - Stripe customer setup
    // - Payment method validity
    // - Credit balance trends
    // - Usage patterns
    // - Permission consistency
    // - Repository access validation

    // Placeholder implementation
    const healthy = issues.length === 0

    if (!healthy) {
      logger.warn(
        { organizationId, issues, recommendations },
        'Organization billing health check failed'
      )
    }

    return { healthy, issues, recommendations }
  } catch (error) {
    logger.error(
      { organizationId, error },
      'Error validating organization billing health'
    )
    return {
      healthy: false,
      issues: ['Health check failed due to system error'],
      recommendations: ['Contact support for assistance'],
    }
  }
}
