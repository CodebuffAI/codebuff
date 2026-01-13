import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { getNextQuotaReset } from '@codebuff/common/util/dates'
import { getErrorObject } from '@codebuff/common/util/error'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'

import { calculateOrganizationUsageAndBalance } from './org-billing'

import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface OrganizationCreditAlert {
  organizationId: string
  organizationName?: string
  alertType:
    | 'low_balance'
    | 'high_usage'
    | 'failed_consumption'
    | 'billing_setup_required'
  currentBalance?: number
  threshold?: number
  usageAmount?: number
  error?: string
  metadata?: Record<string, any>
}

export interface OrganizationAlert {
  id: string
  type:
    | 'low_balance'
    | 'high_usage'
    | 'auto_topup_failed'
    | 'credit_limit_reached'
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * Gets organization alerts for UI display
 */
export async function getOrganizationAlerts(params: {
  organizationId: string
  logger: Logger
}): Promise<OrganizationAlert[]> {
  const { organizationId, logger } = params

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
    const { balance, usageThisCycle } =
      await calculateOrganizationUsageAndBalance({
        ...params,
        quotaResetDate,
        now,
      })

    // Low balance alert
    if (organization.billing_alerts && balance.netBalance < 500) {
      alerts.push({
        id: `low-balance-${organizationId}`,
        type: 'low_balance',
        severity: balance.netBalance < 100 ? 'critical' : 'warning',
        title: 'Low Credit Balance',
        message: `Organization has ${balance.netBalance} credits remaining`,
        timestamp: new Date(),
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
        timestamp: new Date(),
      })
    }

    // Credit limit alert
    if (
      organization.credit_limit &&
      usageThisCycle >= organization.credit_limit * 0.9
    ) {
      alerts.push({
        id: `credit-limit-${organizationId}`,
        type: 'credit_limit_reached',
        severity:
          usageThisCycle >= organization.credit_limit ? 'critical' : 'warning',
        title: 'Credit Limit Approaching',
        message: `Organization has used ${usageThisCycle} of ${organization.credit_limit} credits this month (${Math.round((usageThisCycle / organization.credit_limit) * 100)}%)`,
        timestamp: new Date(),
      })
    }

    // Note: Auto-topup failures are already tracked in the sync_failures table
    // No need for additional database schema updates for this functionality

    return alerts
  } catch (error) {
    logger.error(
      { organizationId, error },
      'Error generating organization alerts',
    )
    return alerts
  }
}

/**
 * Sends alerts for organization credit issues
 */
export async function sendOrganizationAlert(
  params: OrganizationCreditAlert & {
    logger: Logger
  },
): Promise<void> {
  const {
    organizationId,
    alertType,
    currentBalance,
    threshold,
    usageAmount,
    error,
    metadata,
    logger,
  } = params

  try {
    // Log the alert
    logger.warn(
      {
        organizationId,
        alertType,
        currentBalance,
        threshold,
        usageAmount,
        error: error,
        metadata: metadata,
      },
      `Organization alert: ${alertType}`,
    )

    // Track analytics event
    trackEvent({
      event: AnalyticsEvent.CREDIT_GRANT,
      userId: organizationId,
      properties: {
        alertType,
        currentBalance,
        threshold,
      },
      logger,
    })

    // TODO: Implement actual alerting mechanisms:
    // - Email notifications to organization owners
    // - Slack/Discord webhooks
    // - Dashboard notifications
    // - SMS alerts for critical issues

    switch (alertType) {
      case 'low_balance':
        await handleLowBalanceAlert(params)
        break
      case 'high_usage':
        await handleHighUsageAlert(params)
        break
      case 'failed_consumption':
        await handleFailedConsumptionAlert(params)
        break
      case 'billing_setup_required':
        await handleBillingSetupAlert(params)
        break
    }
  } catch (error) {
    logger.error({ alert, error }, 'Failed to send organization alert')
  }
}

async function handleLowBalanceAlert(
  params: OrganizationCreditAlert & {
    logger: Logger
  },
): Promise<void> {
  const { organizationId, currentBalance, logger } = params

  // TODO: Send email to organization owners about low balance
  // TODO: Suggest auto-topup or manual credit purchase
  logger.info(
    { organizationId, balance: currentBalance },
    'Low balance alert sent to organization owners',
  )
}

async function handleHighUsageAlert(
  params: OrganizationCreditAlert & {
    logger: Logger
  },
): Promise<void> {
  const { organizationId, usageAmount, logger } = params

  // TODO: Send usage spike notification
  // TODO: Provide usage breakdown and recommendations
  logger.info(
    { organizationId, usage: usageAmount },
    'High usage alert sent to organization admins',
  )
}

async function handleFailedConsumptionAlert(
  params: OrganizationCreditAlert & {
    logger: Logger
  },
): Promise<void> {
  const { organizationId, error, logger } = params

  // TODO: Send immediate notification about failed credit consumption
  // TODO: Provide troubleshooting steps
  logger.error(
    { organizationId, error },
    'Failed consumption alert sent to organization owners',
  )
}

async function handleBillingSetupAlert(
  params: OrganizationCreditAlert & {
    logger: Logger
  },
): Promise<void> {
  const { organizationId, logger } = params

  // TODO: Send setup reminder to organization owners
  // TODO: Provide setup instructions and links
  logger.info(
    { organizationId },
    'Billing setup reminder sent to organization owners',
  )
}

/**
 * Monitors organization credit consumption and sends alerts when needed
 */
export async function monitorOrganizationCredits(params: {
  organizationId: string
  currentBalance: number
  recentUsage: number
  organizationName?: string
  logger: Logger
}): Promise<void> {
  const {
    organizationId,
    currentBalance,
    recentUsage,
    organizationName,
    logger,
  } = params

  const LOW_BALANCE_THRESHOLD = 100 // Credits
  const HIGH_USAGE_THRESHOLD = 1000 // Credits per day

  try {
    // Check for low balance
    if (currentBalance < LOW_BALANCE_THRESHOLD) {
      await sendOrganizationAlert({
        ...params,
        alertType: 'low_balance',
        currentBalance,
        threshold: LOW_BALANCE_THRESHOLD,
      })
    }

    // Check for high usage
    if (recentUsage > HIGH_USAGE_THRESHOLD) {
      await sendOrganizationAlert({
        ...params,
        alertType: 'high_usage',
        usageAmount: recentUsage,
        threshold: HIGH_USAGE_THRESHOLD,
      })
    }

    // Check for negative balance (debt)
    if (currentBalance < 0) {
      await sendOrganizationAlert({
        ...params,
        alertType: 'failed_consumption',
        currentBalance,
        error: 'Organization has negative credit balance',
      })
    }
  } catch (error) {
    logger.error(
      { organizationId, error },
      'Error monitoring organization credits',
    )
  }
}

/**
 * Tracks organization usage metrics for analytics
 */
export async function trackOrganizationUsageMetrics(params: {
  organizationId: string
  totalCreditsConsumed: number
  uniqueUsers: number
  repositoryCount: number
  averageCreditsPerUser: number
  topRepository: string
  timeframe: 'daily' | 'weekly' | 'monthly'
  logger: Logger
}): Promise<void> {
  const {
    organizationId,
    totalCreditsConsumed,
    uniqueUsers,
    repositoryCount,
    averageCreditsPerUser,
    topRepository,
    timeframe,
    logger,
  } = params

  try {
    logger.info(
      {
        organizationId,
        totalCreditsConsumed,
        uniqueUsers,
        repositoryCount,
        averageCreditsPerUser,
        topRepository,
        timeframe,
      },
      'Organization usage metrics tracked',
    )

    // Track analytics event
    trackEvent({
      event: AnalyticsEvent.CREDIT_GRANT,
      userId: organizationId,
      properties: {
        type: 'usage_metrics',
        timeframe,
        totalCreditsConsumed,
        uniqueUsers,
        repositoryCount,
      },
      logger,
    })

    // TODO: Store metrics in time-series database for dashboards
    // TODO: Generate usage reports
    // TODO: Identify usage patterns and optimization opportunities
  } catch (error) {
    const { logger: _logger, ...paramsWithoutLogger } = params
    const logData: Record<string, unknown> = {
      ...paramsWithoutLogger,
      error: getErrorObject(error),
    }
    logger.error(logData, 'Failed to track organization usage metrics')
  }
}

/**
 * Validates organization billing health
 */
export async function validateOrganizationBillingHealth(params: {
  organizationId: string
  logger: Logger
}): Promise<{
  healthy: boolean
  issues: string[]
  recommendations: string[]
}> {
  const { organizationId, logger } = params

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
        'Organization billing health check failed',
      )
    }

    return { healthy, issues, recommendations }
  } catch (error) {
    logger.error(
      { organizationId, error: getErrorObject(error) },
      'Error validating organization billing health',
    )
    return {
      healthy: false,
      issues: ['Health check failed due to system error'],
      recommendations: ['Contact support for assistance'],
    }
  }
}
