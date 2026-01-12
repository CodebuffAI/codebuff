import { GRANT_PRIORITIES } from '@codebuff/common/constants/grant-priorities'
import { GrantTypeValues } from '@codebuff/common/types/grant'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { withSerializableTransaction } from '@codebuff/internal/db/transaction'
import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { and, asc, gt, isNull, or, eq } from 'drizzle-orm'

import { consumeFromOrderedGrants } from './balance-calculator'

import type {
  CreditBalance,
  CreditUsageAndBalance,
  CreditConsumptionResult,
} from './balance-calculator'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { OptionalFields } from '@codebuff/common/types/function-params'
import type { GrantType } from '@codebuff/internal/db/schema'

// Add a minimal structural type that both `db` and `tx` satisfy
type DbConn = Pick<typeof db, 'select' | 'update'>

/**
 * Syncs organization billing cycle with Stripe subscription and returns the current cycle start date.
 * All organizations are expected to have Stripe subscriptions.
 */
export async function syncOrganizationBillingCycle(params: {
  organizationId: string
  logger: Logger
}): Promise<Date> {
  const { organizationId, logger } = params

  const organization = await db.query.org.findFirst({
    where: eq(schema.org.id, organizationId),
    columns: {
      stripe_customer_id: true,
      current_period_start: true,
      current_period_end: true,
    },
  })

  if (!organization) {
    throw new Error(`Organization ${organizationId} not found`)
  }

  if (!organization.stripe_customer_id) {
    throw new Error(
      `Organization ${organizationId} does not have a Stripe customer ID`,
    )
  }

  const now = new Date()

  try {
    const subscriptions = await stripeServer.subscriptions.list({
      customer: organization.stripe_customer_id,
      status: 'active',
      limit: 1,
    })

    if (subscriptions.data.length === 0) {
      throw new Error(
        `No active Stripe subscription found for organization ${organizationId}`,
      )
    }

    const subscription = subscriptions.data[0]
    const stripeCurrentStart = new Date(
      subscription.current_period_start * 1000,
    )
    const stripeCurrentEnd = new Date(subscription.current_period_end * 1000)

    // Check if we need to update the stored billing cycle dates
    const needsUpdate =
      !organization.current_period_start ||
      !organization.current_period_end ||
      Math.abs(
        stripeCurrentStart.getTime() -
          organization.current_period_start.getTime(),
      ) >
        60 * 1000 ||
      Math.abs(
        stripeCurrentEnd.getTime() - organization.current_period_end.getTime(),
      ) >
        60 * 1000

    if (needsUpdate) {
      await db
        .update(schema.org)
        .set({
          current_period_start: stripeCurrentStart,
          current_period_end: stripeCurrentEnd,
          updated_at: now,
        })
        .where(eq(schema.org.id, organizationId))

      logger.info(
        {
          organizationId,
          currentPeriodStart: stripeCurrentStart.toISOString(),
          currentPeriodEnd: stripeCurrentEnd.toISOString(),
        },
        'Synced organization billing cycle with Stripe subscription',
      )
    }

    logger.debug(
      {
        organizationId,
        stripeCurrentStart: stripeCurrentStart.toISOString(),
        stripeCurrentEnd: stripeCurrentEnd.toISOString(),
      },
      'Using Stripe subscription period for organization billing cycle',
    )

    return stripeCurrentStart
  } catch (error) {
    logger.error(
      { organizationId, error },
      'Failed to sync organization billing cycle with Stripe',
    )
    throw error
  }
}

/**
 * Gets active grants for an organization, ordered by expiration, priority, and creation date.
 */
export async function getOrderedActiveOrganizationGrants(
  params: OptionalFields<
    {
      organizationId: string
      now: Date
      conn: DbConn
    },
    'conn'
  >,
) {
  const withDefaults = { conn: db, ...params }
  const { organizationId, now, conn } = withDefaults

  return conn
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.org_id, organizationId),
        or(
          isNull(schema.creditLedger.expires_at),
          gt(schema.creditLedger.expires_at, now),
        ),
      ),
    )
    .orderBy(
      asc(schema.creditLedger.priority),
      asc(schema.creditLedger.expires_at),
      asc(schema.creditLedger.created_at),
    )
}

/**
 * Calculates both the current balance and usage in this cycle for an organization.
 */
export async function calculateOrganizationUsageAndBalance(
  params: OptionalFields<
    {
      organizationId: string
      quotaResetDate: Date
      now: Date
      conn: DbConn
      logger: Logger
    },
    'conn' | 'now'
  >,
): Promise<CreditUsageAndBalance> {
  const withDefaults = {
    now: new Date(),
    conn: db,
    ...params,
  }
  const { organizationId, quotaResetDate, now, conn, logger } = withDefaults

  // Get all relevant grants for the organization
  const grants = await getOrderedActiveOrganizationGrants(withDefaults)

  // Initialize breakdown and principals with all grant types set to 0
  const initialBreakdown: Record<GrantType, number> = {} as Record<
    GrantType,
    number
  >
  const initialPrincipals: Record<GrantType, number> = {} as Record<
    GrantType,
    number
  >

  for (const type of GrantTypeValues) {
    initialBreakdown[type] = 0
    initialPrincipals[type] = 0
  }

  // Initialize balance structure
  const balance: CreditBalance = {
    totalRemaining: 0,
    totalDebt: 0,
    netBalance: 0,
    breakdown: initialBreakdown,
    principals: initialPrincipals,
  }

  // Calculate both metrics in one pass
  let usageThisCycle = 0
  let totalPositiveBalance = 0
  let totalDebt = 0

  // First pass: calculate initial totals and usage
  for (const grant of grants) {
    const grantType = grant.type as GrantType

    // Calculate usage if grant was active in this cycle
    if (
      grant.created_at > quotaResetDate ||
      !grant.expires_at ||
      grant.expires_at > quotaResetDate
    ) {
      usageThisCycle += grant.principal - grant.balance
    }

    // Add to balance if grant is currently active
    if (!grant.expires_at || grant.expires_at > now) {
      balance.principals[grantType] += grant.principal
      if (grant.balance > 0) {
        totalPositiveBalance += grant.balance
        balance.breakdown[grantType] += grant.balance
      } else if (grant.balance < 0) {
        totalDebt += Math.abs(grant.balance)
      }
    }
  }

  // Perform in-memory settlement if there's both debt and positive balance
  if (totalDebt > 0 && totalPositiveBalance > 0) {
    const settlementAmount = Math.min(totalDebt, totalPositiveBalance)
    logger.debug(
      { organizationId, totalDebt, totalPositiveBalance, settlementAmount },
      'Performing in-memory settlement for organization',
    )

    // After settlement:
    totalPositiveBalance -= settlementAmount
    totalDebt -= settlementAmount
  }

  // Set final balance values after settlement
  balance.totalRemaining = totalPositiveBalance
  balance.totalDebt = totalDebt
  balance.netBalance = totalPositiveBalance - totalDebt

  logger.debug(
    { organizationId, balance, usageThisCycle, grantsCount: grants.length },
    'Calculated organization usage and settled balance',
  )

  return { usageThisCycle, balance }
}

/**
 * Type for the withSerializableTransaction dependency.
 */
type WithSerializableTransactionFn = <T>(params: {
  callback: (tx: any) => Promise<T>
  context: Record<string, unknown>
  logger: Logger
}) => Promise<T>

/**
 * Dependencies for consumeOrganizationCredits
 */
export type ConsumeOrganizationCreditsDeps = {
  withSerializableTransaction?: WithSerializableTransactionFn
}

/**
 * Consumes credits from organization grants in priority order.
 */
export async function consumeOrganizationCredits(params: {
  organizationId: string
  creditsToConsume: number
  logger: Logger
  deps?: ConsumeOrganizationCreditsDeps
}): Promise<CreditConsumptionResult> {
  const { organizationId, creditsToConsume, logger, deps = {} } = params
  const transactionFn = deps.withSerializableTransaction ?? withSerializableTransaction

  return await transactionFn({
    callback: async (tx) => {
      const now = new Date()
      const activeGrants = await getOrderedActiveOrganizationGrants({
        ...params,
        now,
        conn: tx,
      })

      if (activeGrants.length === 0) {
        logger.error(
          { organizationId, creditsToConsume },
          'No active organization grants found to consume credits from',
        )
        throw new Error('No active organization grants found')
      }

      const result = await consumeFromOrderedGrants({
        userId: organizationId,
        creditsToConsume,
        grants: activeGrants,
        tx,
        logger,
      })

      return result
    },
    context: { organizationId, creditsToConsume },
    logger,
  })
}

/**
 * Dependencies for grantOrganizationCredits
 */
export type GrantOrganizationCreditsDeps = {
  db?: Pick<typeof db, 'insert'>
}

/**
 * Grants credits to an organization.
 */
export async function grantOrganizationCredits(
  params: OptionalFields<
    {
      organizationId: string
      userId: string
      amount: number
      operationId: string
      description: string
      expiresAt: Date | null
      logger: Logger
      deps: GrantOrganizationCreditsDeps
    },
    'description' | 'expiresAt' | 'deps'
  >,
): Promise<void> {
  const withDefaults = {
    description: 'Organization credit purchase',
    expiresAt: null,
    deps: {},
    ...params,
  }
  const {
    organizationId,
    userId,
    amount,
    operationId,
    description,
    expiresAt,
    logger,
    deps,
  } = withDefaults

  const dbClient = deps.db ?? db
  const now = new Date()

  try {
    await dbClient.insert(schema.creditLedger).values({
      operation_id: operationId,
      user_id: userId,
      org_id: organizationId,
      principal: amount,
      balance: amount,
      type: 'organization',
      description,
      priority: GRANT_PRIORITIES.organization,
      expires_at: expiresAt,
      created_at: now,
    })

    logger.info(
      { organizationId, userId, operationId, amount, expiresAt },
      'Created new organization credit grant',
    )
  } catch (error: any) {
    // Check if this is a unique constraint violation on operation_id
    if (error.code === '23505' && error.constraint === 'credit_ledger_pkey') {
      logger.info(
        { organizationId, userId, operationId, amount },
        'Skipping duplicate organization credit grant due to idempotency check',
      )
      return // Exit successfully, another concurrent request already created this grant
    }
    throw error // Re-throw any other error
  }
}

/**
 * Extracts owner and repository name from a repository URL.
 * Returns null if the URL format is not recognized.
 */
export function extractOwnerAndRepo(
  url: string,
): { owner: string; repo: string } | null {
  try {
    // Handle empty or invalid URLs
    if (!url.trim()) return null

    let normalizedUrl = url.trim()

    // Convert SSH to HTTPS format for parsing BEFORE adding https:// prefix
    if (normalizedUrl.startsWith('git@')) {
      normalizedUrl = normalizedUrl.replace(/^git@([^:]+):/, 'https://$1/')
    }

    // Normalize the URL - add https:// if missing (after SSH conversion)
    if (
      !normalizedUrl.startsWith('http://') &&
      !normalizedUrl.startsWith('https://')
    ) {
      normalizedUrl = 'https://' + normalizedUrl
    }

    const urlObj = new URL(normalizedUrl)
    const pathSegments = urlObj.pathname
      .split('/')
      .filter((segment) => segment.length > 0)

    // For known Git hosting providers, extract owner/repo from path
    const knownHosts = ['github.com', 'gitlab.com', 'bitbucket.org']
    if (knownHosts.includes(urlObj.hostname) && pathSegments.length >= 2) {
      let owner = pathSegments[0]
      let repo = pathSegments[1]

      // Remove .git suffix if present
      if (repo.endsWith('.git')) {
        repo = repo.slice(0, -4)
      }

      return { owner: owner.toLowerCase(), repo: repo.toLowerCase() }
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Normalizes a repository URL to a standard format.
 */
export function normalizeRepositoryUrl(url: string): string {
  let normalized = url.toLowerCase().trim()

  // Remove .git suffix
  if (normalized.endsWith('.git')) {
    normalized = normalized.slice(0, -4)
  }

  // Convert SSH to HTTPS
  if (normalized.startsWith('git@github.com:')) {
    normalized = normalized.replace('git@github.com:', 'https://github.com/')
  }

  // Ensure https:// prefix for github URLs
  if (!normalized.startsWith('http') && normalized.includes('github.com')) {
    normalized = 'https://' + normalized
  }

  // Parse URL to extract base repository URL (strip extra paths like /pull/123/files)
  try {
    const urlObj = new URL(normalized)
    const pathSegments = urlObj.pathname
      .split('/')
      .filter((segment) => segment.length > 0)

    // For known Git hosting providers, only keep the first two path segments (owner/repo)
    const knownHosts = ['github.com', 'gitlab.com', 'bitbucket.org']
    if (knownHosts.includes(urlObj.hostname) && pathSegments.length >= 2) {
      // Reconstruct URL with only owner/repo path
      const basePath = `/${pathSegments[0]}/${pathSegments[1]}`
      normalized = `${urlObj.protocol}//${urlObj.hostname}${basePath}`
    }
  } catch (error) {
    // If URL parsing fails, return the normalized string as-is
    // This maintains backward compatibility
  }

  return normalized
}

/**
 * Validates and normalizes a repository URL.
 */
export function validateAndNormalizeRepositoryUrl(url: string): {
  isValid: boolean
  normalizedUrl?: string
  error?: string
} {
  try {
    // Basic URL validation
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)

    // Whitelist allowed domains
    const allowedDomains = ['github.com', 'gitlab.com', 'bitbucket.org']
    if (!allowedDomains.includes(urlObj.hostname)) {
      return { isValid: false, error: 'Repository domain not allowed' }
    }

    // Normalize URL format
    const normalized = normalizeRepositoryUrl(url)

    return { isValid: true, normalizedUrl: normalized }
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' }
  }
}

/**
 * Updates Stripe subscription quantity based on actual member count
 * Only updates if the quantity differs from what's in Stripe
 */
export async function updateStripeSubscriptionQuantity(params: {
  stripeSubscriptionId: string
  actualQuantity: number
  orgId: string
  userId?: string
  context: string
  addedCount?: number
  logger: Logger
}): Promise<void> {
  const {
    stripeSubscriptionId,
    actualQuantity,
    orgId,
    userId,
    context,
    addedCount,
    logger,
  } = params

  try {
    const subscription =
      await stripeServer.subscriptions.retrieve(stripeSubscriptionId)

    const teamFeeItem = subscription.items.data.find(
      (item) => item.price.id === env.STRIPE_TEAM_FEE_PRICE_ID,
    )

    if (teamFeeItem && teamFeeItem.quantity !== actualQuantity) {
      await stripeServer.subscriptionItems.update(teamFeeItem.id, {
        quantity: actualQuantity,
        proration_behavior: 'create_prorations',
        proration_date: Math.floor(Date.now() / 1000),
      })

      const logData: any = {
        orgId,
        actualQuantity,
        previousQuantity: teamFeeItem.quantity,
        context,
      }

      if (userId) logData.userId = userId
      if (addedCount !== undefined) logData.addedCount = addedCount

      logger.info(logData, `Updated Stripe subscription quantity: ${context}`)
    }
  } catch (stripeError) {
    const logData: any = {
      orgId,
      actualQuantity,
      context,
      error: stripeError,
    }

    if (userId) logData.userId = userId
    if (addedCount !== undefined) logData.addedCount = addedCount

    logger.error(
      logData,
      `Failed to update Stripe subscription quantity: ${context}`,
    )
    // Don't throw - we don't want Stripe failures to break the core functionality
  }
}
