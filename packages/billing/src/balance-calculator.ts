import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { GrantTypeValues } from '@codebuff/common/types/grant'
import { failure, getErrorObject, success } from '@codebuff/common/util/error'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { withAdvisoryLockTransaction } from '@codebuff/internal/db/transaction'
import { and, asc, desc, gt, isNull, ne, or, eq, sql } from 'drizzle-orm'
import { union } from 'drizzle-orm/pg-core'

import { reportPurchasedCreditsToStripe } from './stripe-metering'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
  OptionalFields,
} from '@codebuff/common/types/function-params'
import type { ErrorOr } from '@codebuff/common/util/error'
import type { GrantType } from '@codebuff/internal/db/schema'

export interface CreditBalance {
  totalRemaining: number
  totalDebt: number
  netBalance: number
  breakdown: Record<GrantType, number>
  principals: Record<GrantType, number>
}

export interface CreditUsageAndBalance {
  usageThisCycle: number
  balance: CreditBalance
}

export interface CreditConsumptionResult {
  consumed: number
  fromPurchased: number
}

// Add a minimal structural type that both `db` and `tx` satisfy
type DbConn = Pick<
  typeof db,
  'select' | 'update'
> /* + whatever else you call */

function buildActiveGrantsFilter(userId: string, now: Date) {
  return and(
    eq(schema.creditLedger.user_id, userId),
    or(
      isNull(schema.creditLedger.expires_at),
      gt(schema.creditLedger.expires_at, now),
    ),
  )
}

/**
 * Gets active grants for a user, ordered by expiration (soonest first), then priority, and creation date.
 * Added optional `conn` param so callers inside a transaction can supply their TX object.
 */
export async function getOrderedActiveGrants(params: {
  userId: string
  now: Date
  conn?: DbConn
}) {
  const { userId, now, conn = db } = params
  const activeGrantsFilter = buildActiveGrantsFilter(userId, now)
  return conn
    .select()
    .from(schema.creditLedger)
    .where(activeGrantsFilter)
    .orderBy(
      // Use grants based on priority, then expiration date, then creation date
      asc(schema.creditLedger.priority),
      asc(schema.creditLedger.expires_at),
      asc(schema.creditLedger.created_at),
    )
}

/**
 * Gets active grants ordered for credit consumption, ensuring the "last grant" is always
 * included even if its balance is zero.
 *
 * The "last grant" (lowest priority, latest expiration, latest creation) is preserved because:
 * - When a user exhausts all credits, debt must be recorded against a grant
 * - Debt should accumulate on the grant that would be consumed last under normal circumstances
 * - This is typically a subscription grant (lowest priority) that renews monthly
 * - Recording debt on the correct grant ensures proper attribution and repayment when
 *   credits are added (debt is repaid from the same grant it was charged to)
 *
 * Uses a single UNION query to fetch both non-zero grants and the "last grant" in one
 * database round-trip. UNION automatically deduplicates if the last grant already
 * appears in the non-zero set.
 */
async function getOrderedActiveGrantsForConsumption(params: {
  userId: string
  now: Date
  conn?: DbConn
}) {
  const { userId, now, conn = db } = params
  const activeGrantsFilter = buildActiveGrantsFilter(userId, now)

  // Single UNION query combining:
  // 1. Non-zero grants (consumed in priority order)
  // 2. The "last grant" (for debt recording, even if balance is zero)
  //
  // UNION (not UNION ALL) automatically deduplicates if the last grant has non-zero balance.
  // Final ORDER BY sorts all results in consumption order.
  const grants = await union(
    // First query: all non-zero balance grants
    conn
      .select()
      .from(schema.creditLedger)
      .where(and(activeGrantsFilter, ne(schema.creditLedger.balance, 0))),
    // Second query: the single "last grant" that would be consumed last
    // (highest priority number, latest/never expiration, latest creation)
    conn
      .select()
      .from(schema.creditLedger)
      .where(activeGrantsFilter)
      .orderBy(
        desc(schema.creditLedger.priority),
        sql`${schema.creditLedger.expires_at} DESC NULLS FIRST`,
        desc(schema.creditLedger.created_at),
      )
      .limit(1),
  ).orderBy(
    // Sort in consumption order:
    // - Lower priority number = consumed first
    // - Earlier expiration = consumed first (NULL = never expires, consumed last)
    // - Earlier creation = consumed first
    asc(schema.creditLedger.priority),
    sql`${schema.creditLedger.expires_at} ASC NULLS LAST`,
    asc(schema.creditLedger.created_at),
  )

  return grants
}

/**
 * Updates a single grant's balance and logs the change.
 */
export async function updateGrantBalance(params: {
  userId: string
  grant: typeof schema.creditLedger.$inferSelect
  consumed: number
  newBalance: number
  tx: DbConn
  logger: Logger
}) {
  const { userId: _userId, grant, consumed: _consumed, newBalance, tx, logger: _logger } = params
  await tx
    .update(schema.creditLedger)
    .set({ balance: newBalance })
    .where(eq(schema.creditLedger.operation_id, grant.operation_id))

  // Note (James): This log was too noisy. Reenable it as you need to test something.
  // logger.debug(
  //   {
  //     userId,
  //     grantId: grant.operation_id,
  //     grantType: grant.type,
  //     consumed,
  //     remaining: newBalance,
  //     expiresAt: grant.expires_at,
  //   },
  //   'Updated grant remaining amount after consumption',
  // )
}

/**
 * Consumes credits from a list of ordered grants.
 */
export async function consumeFromOrderedGrants(
  params: {
    userId: string
    creditsToConsume: number
    grants: (typeof schema.creditLedger.$inferSelect)[]
    logger: Logger
  } & ParamsExcluding<
    typeof updateGrantBalance,
    'grant' | 'consumed' | 'newBalance'
  >,
): Promise<CreditConsumptionResult> {
  const { userId, creditsToConsume, grants, logger } = params

  let remainingToConsume = creditsToConsume
  let consumed = 0
  let fromPurchased = 0

  // First pass: try to repay any debt
  for (const grant of grants) {
    if (grant.balance < 0 && remainingToConsume > 0) {
      const debtAmount = Math.abs(grant.balance)
      const repayAmount = Math.min(debtAmount, remainingToConsume)
      const newBalance = grant.balance + repayAmount
      remainingToConsume -= repayAmount
      consumed += repayAmount

      await updateGrantBalance({
        ...params,
        grant,
        consumed: -repayAmount,
        newBalance,
      })

      logger.debug(
        { userId, grantId: grant.operation_id, repayAmount, newBalance },
        'Repaid debt in grant',
      )
    }
  }

  // Second pass: consume from positive balances
  for (const grant of grants) {
    if (remainingToConsume <= 0) break
    if (grant.balance <= 0) continue

    const consumeFromThisGrant = Math.min(remainingToConsume, grant.balance)
    const newBalance = grant.balance - consumeFromThisGrant
    remainingToConsume -= consumeFromThisGrant
    consumed += consumeFromThisGrant

    // Track consumption from purchased credits
    if (grant.type === 'purchase') {
      fromPurchased += consumeFromThisGrant
    }

    await updateGrantBalance({
      ...params,
      grant,
      consumed: consumeFromThisGrant,
      newBalance,
    })
  }

  // If we still have remaining to consume and no grants left, create debt in the last grant
  if (remainingToConsume > 0 && grants.length > 0) {
    const lastGrant = grants[grants.length - 1]

    if (lastGrant.balance <= 0) {
      const newBalance = lastGrant.balance - remainingToConsume
      await updateGrantBalance({
        ...params,
        grant: lastGrant,
        consumed: remainingToConsume,
        newBalance,
      })
      consumed += remainingToConsume

      logger.warn(
        {
          userId,
          grantId: lastGrant.operation_id,
          requested: remainingToConsume,
          consumed: remainingToConsume,
          newDebt: Math.abs(newBalance),
        },
        'Created new debt in grant',
      )
    }
  }

  return { consumed, fromPurchased }
}

/**
 * Calculates both the current balance and usage in this cycle in a single query.
 * This is more efficient than calculating them separately.
 */
export async function calculateUsageAndBalance(
  params: OptionalFields<
    {
      userId: string
      quotaResetDate: Date
      now: Date
      conn: DbConn
      isPersonalContext: boolean
      logger: Logger
    } & ParamsOf<typeof getOrderedActiveGrants>,
    'now' | 'conn' | 'isPersonalContext'
  >,
): Promise<CreditUsageAndBalance> {
  const withDefaults = {
    now: new Date(),
    conn: db, // Add optional conn parameter to pass transaction
    isPersonalContext: false, // Add flag to exclude organization credits for personal usage
    ...params,
  }
  const { userId, quotaResetDate, now, isPersonalContext, logger } =
    withDefaults

  // Get all relevant grants in one query, using the provided connection
  const grants = await getOrderedActiveGrants(withDefaults)

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

    // Skip organization and subscription credits for personal context
    // Subscription credits are shown separately in the CLI with progress bars
    if (isPersonalContext && (grantType === 'organization' || grantType === 'subscription')) {
      continue
    }

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
      { userId, totalDebt, totalPositiveBalance, settlementAmount },
      'Performing in-memory settlement',
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
    {
      userId,
      netBalance: balance.netBalance,
      usageThisCycle,
      grantsCount: grants.length,
      isPersonalContext,
    },
    'Calculated usage and settled balance',
  )

  return { usageThisCycle, balance }
}

/**
 * Updates the remaining amounts in credit grants after consumption.
 * Follows priority order strictly - higher priority grants (lower number) are consumed first.
 * Returns details about credit consumption including how many came from purchased credits.
 *
 * Uses advisory locks to serialize credit operations per user, preventing concurrent
 * modifications that could lead to incorrect credit usage (e.g., "double spending" credits).
 * This approach eliminates serialization failures by making concurrent transactions wait
 * instead of failing and retrying.
 *
 * @param userId The ID of the user
 * @param creditsToConsume Number of credits being consumed
 * @returns Promise resolving to number of credits consumed
 */
export async function consumeCredits(params: {
  userId: string
  stripeCustomerId?: string | null
  creditsToConsume: number
  logger: Logger
}): Promise<CreditConsumptionResult> {
  const { userId, creditsToConsume, logger } = params

  const { result, lockWaitMs } = await withAdvisoryLockTransaction({
    callback: async (tx) => {
      const now = new Date()
      const activeGrants = await getOrderedActiveGrantsForConsumption({
        ...params,
        now,
        conn: tx,
      })

      if (activeGrants.length === 0) {
        logger.error(
          { userId, creditsToConsume },
          'No active grants found to consume credits from',
        )
        throw new Error('No active grants found')
      }

      const consumeResult = await consumeFromOrderedGrants({
        ...params,
        creditsToConsume,
        grants: activeGrants,
        tx,
      })

      return consumeResult
    },
    lockKey: `user:${userId}`,
    context: { userId, creditsToConsume },
    logger,
  })

  // Log successful credit consumption with lock timing
  logger.info(
    {
      userId,
      creditsConsumed: result.consumed,
      creditsRequested: creditsToConsume,
      fromPurchased: result.fromPurchased,
      lockWaitMs,
    },
    'Credits consumed',
  )

  // Track credit consumption analytics
  trackEvent({
    event: AnalyticsEvent.CREDIT_CONSUMED,
    userId,
    properties: {
      creditsConsumed: result.consumed,
      creditsRequested: creditsToConsume,
      fromPurchased: result.fromPurchased,
      source: 'consumeCredits',
    },
    logger,
  })

  await reportPurchasedCreditsToStripe({
    userId,
    stripeCustomerId: params.stripeCustomerId,
    purchasedCredits: result.fromPurchased,
    logger,
    extraPayload: {
      source: 'consumeCredits',
    },
  })

  return result
}

/**
 * Extracts PostgreSQL-specific error details for better debugging.
 */
function extractPostgresErrorDetails(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return {}
  }

  const pgError = error as Record<string, unknown>
  const details: Record<string, unknown> = {}

  // Standard PostgreSQL error fields
  if ('code' in pgError) details.pgCode = pgError.code
  if ('constraint' in pgError) details.pgConstraint = pgError.constraint
  if ('detail' in pgError) details.pgDetail = pgError.detail
  if ('schema' in pgError) details.pgSchema = pgError.schema
  if ('table' in pgError) details.pgTable = pgError.table
  if ('column' in pgError) details.pgColumn = pgError.column
  if ('severity' in pgError) details.pgSeverity = pgError.severity
  if ('routine' in pgError) details.pgRoutine = pgError.routine

  // Drizzle-specific fields
  if ('cause' in pgError && pgError.cause) {
    details.causeDetails = extractPostgresErrorDetails(pgError.cause)
  }

  return details
}

export async function consumeCreditsAndAddAgentStep(params: {
  messageId: string
  userId: string
  stripeCustomerId?: string | null
  agentId: string
  clientId: string | null
  clientRequestId: string | null

  startTime: Date

  model: string
  reasoningText: string
  response: string

  cost: number
  credits: number
  byok: boolean

  inputTokens: number
  cacheCreationInputTokens: number | null
  cacheReadInputTokens: number
  reasoningTokens: number | null
  outputTokens: number

  logger: Logger
}): Promise<ErrorOr<CreditConsumptionResult & { agentStepId: string }>> {
  const {
    messageId,
    userId,
    agentId,
    clientId,
    clientRequestId,

    startTime,

    model,
    reasoningText,
    response,

    cost,
    credits,
    byok,

    inputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    reasoningTokens,
    outputTokens,

    logger,
  } = params

  const finishedAt = new Date()
  const latencyMs = finishedAt.getTime() - startTime.getTime()

  // Track grant state for error logging (declared outside transaction for access in catch block)
  let activeGrantsSnapshot: Array<{
    operation_id: string
    balance: number
    type: string
    priority: number
    expires_at: Date | null
  }> = []
  let phase: 'fetch_grants' | 'consume_credits' | 'insert_message' | 'complete' =
    'fetch_grants'

  try {
    const { result, lockWaitMs } = await withAdvisoryLockTransaction({
      callback: async (tx) => {
        // Reset state at start of each transaction attempt (in case of retries)
        activeGrantsSnapshot = []
        phase = 'fetch_grants'

        const now = new Date()

        let consumeResult: CreditConsumptionResult | null = null
        consumeCredits: {
          if (byok) {
            break consumeCredits
          }

          const activeGrants = await getOrderedActiveGrantsForConsumption({
            ...params,
            now,
            conn: tx,
          })

          // Capture grant snapshot for error logging (includes expires_at for timing issues)
          activeGrantsSnapshot = activeGrants.map((g) => ({
            operation_id: g.operation_id,
            balance: g.balance,
            type: g.type,
            priority: g.priority,
            expires_at: g.expires_at,
          }))

          if (activeGrants.length === 0) {
            logger.error(
              { userId, credits },
              'No active grants found to consume credits from',
            )
            throw new Error('No active grants found')
          }

          phase = 'consume_credits'
          consumeResult = await consumeFromOrderedGrants({
            ...params,
            creditsToConsume: credits,
            grants: activeGrants,
            tx,
          })

          if (userId === TEST_USER_ID) {
            return { ...consumeResult, agentStepId: 'test-step-id' }
          }
        }

        phase = 'insert_message'
        try {
          await tx.insert(schema.message).values({
            id: messageId,
            agent_id: agentId,
            finished_at: new Date(),
            client_id: clientId,
            client_request_id: clientRequestId,
            model,
            reasoning_text: reasoningText,
            response,
            input_tokens: inputTokens,
            cache_creation_input_tokens: cacheCreationInputTokens,
            cache_read_input_tokens: cacheReadInputTokens,
            reasoning_tokens: reasoningTokens,
            output_tokens: outputTokens,
            cost: cost.toString(),
            credits,
            byok,
            latency_ms: latencyMs,
            user_id: userId,
          })
        } catch (error) {
          logger.error(
            {
              messageId,
              userId,
              agentId,
              error: getErrorObject(error),
              pgDetails: extractPostgresErrorDetails(error),
            },
            'Failed to insert message',
          )
          throw error
        }

        phase = 'complete'
        if (!consumeResult) {
          consumeResult = {
            consumed: 0,
            fromPurchased: 0,
          }
        }
        return { ...consumeResult, agentStepId: crypto.randomUUID() }
      },
      lockKey: `user:${userId}`,
      context: { userId, credits },
      logger,
    })

    // Log successful credit consumption with lock timing
    logger.info(
      {
        userId,
        messageId,
        creditsConsumed: result.consumed,
        creditsRequested: credits,
        fromPurchased: result.fromPurchased,
        lockWaitMs,
        agentId,
        model,
      },
      'Credits consumed and agent step recorded',
    )

    // Track credit consumption analytics
    trackEvent({
      event: AnalyticsEvent.CREDIT_CONSUMED,
      userId,
      properties: {
        creditsConsumed: result.consumed,
        creditsRequested: credits,
        fromPurchased: result.fromPurchased,
        messageId,
        agentId,
        model,
        source: 'consumeCreditsAndAddAgentStep',
        inputTokens,
        outputTokens,
        reasoningTokens: reasoningTokens ?? 0,
        cacheReadInputTokens,
        latencyMs,
        byok,
      },
      logger,
    })

    await reportPurchasedCreditsToStripe({
      userId,
      stripeCustomerId: params.stripeCustomerId,
      purchasedCredits: result.fromPurchased,
      logger,
      eventId: messageId,
      timestamp: finishedAt,
      extraPayload: {
        source: 'consumeCreditsAndAddAgentStep',
        message_id: messageId,
      },
    })

    return success(result)
  } catch (error) {
    // Extract detailed error information for debugging
    const pgDetails = extractPostgresErrorDetails(error)

    logger.error(
      {
        error: getErrorObject(error),
        pgDetails,
        transactionContext: {
          phase,
          userId,
          messageId,
          agentId,
          clientId,
          clientRequestId,
          credits,
          cost,
          byok,
          model,
          latencyMs,
        },
        grantsSnapshot: activeGrantsSnapshot,
        grantsCount: activeGrantsSnapshot.length,
        totalGrantBalance: activeGrantsSnapshot.reduce(
          (sum, g) => sum + g.balance,
          0,
        ),
      },
      'Error consuming credits and adding agent step',
    )
    return failure(error)
  }
}

/**
 * Calculate the total credits used during the current billing cycle for a user
 * by summing the difference between initial and remaining amounts for all relevant grants.
 */
export async function calculateUsageThisCycle(params: {
  userId: string
  quotaResetDate: Date
}): Promise<number> {
  const { userId, quotaResetDate } = params

  const usageResult = await db
    .select({
      totalUsed: sql<number>`COALESCE(SUM(${schema.creditLedger.principal} - ${schema.creditLedger.balance}), 0)`,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        // Grant was created during this cycle OR expires after this cycle starts (including never expires)
        or(
          gt(schema.creditLedger.created_at, quotaResetDate),
          and(
            or(
              isNull(schema.creditLedger.expires_at),
              gt(schema.creditLedger.expires_at, quotaResetDate),
            ),
          ),
        ),
      ),
    )

  return usageResult[0].totalUsed
}
