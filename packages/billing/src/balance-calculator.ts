import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { failure, getErrorObject, success } from '@codebuff/common/util/error'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { withAdvisoryLockTransaction } from '@codebuff/internal/db/transaction'
import { and, asc, desc, eq, gt, isNull, ne, or, sql } from 'drizzle-orm'
import { union } from 'drizzle-orm/pg-core'

import {
  calculateUsageAndBalanceFromGrants,
  getOrderedActiveGrantsForOwner,
} from './billing-core'
import { reportPurchasedCreditsToStripe } from './stripe-metering'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
  OptionalFields,
} from '@codebuff/common/types/function-params'
import type { ErrorOr } from '@codebuff/common/util/error'
import type {
  CreditConsumptionResult,
  CreditUsageAndBalance,
  DbConn,
} from './billing-core'

export type {
  CreditBalance,
  CreditUsageAndBalance,
  CreditConsumptionResult,
} from './billing-core'

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
 *
 * @param includeExpiredSince - When provided, includes grants that expired after this date.
 *   Use this for usage calculations to include mid-cycle expired grants.
 */
export async function getOrderedActiveGrants(params: {
  userId: string
  now: Date
  conn?: DbConn
  includeExpiredSince?: Date
}) {
  const { userId, now, conn, includeExpiredSince } = params
  return getOrderedActiveGrantsForOwner({
    ownerId: userId,
    ownerType: 'user',
    now,
    conn,
    includeExpiredSince,
  })
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
  const { userId, grant, consumed, newBalance, tx, logger } = params
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

  // Track effective balances for all grants since updateGrantBalance only updates DB, not in-memory
  // This Map is the single source of truth for grant balances within this function
  const effectiveBalances = new Map<string, number>()

  // First pass: try to repay any debt
  for (const grant of grants) {
    if (grant.balance < 0 && remainingToConsume > 0) {
      const debtAmount = Math.abs(grant.balance)
      const repayAmount = Math.min(debtAmount, remainingToConsume)
      const newBalance = grant.balance + repayAmount
      remainingToConsume -= repayAmount
      consumed += repayAmount

      // Track the effective balance after this modification
      effectiveBalances.set(grant.operation_id, newBalance)

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

  // Track the last grant we consumed from for debt creation
  let lastConsumedGrant: (typeof grants)[0] | null = null

  // Second pass: consume from positive balances
  for (const grant of grants) {
    if (remainingToConsume <= 0) break
    // Use effective balance if we modified this grant in first pass, otherwise use original
    const currentBalance = effectiveBalances.get(grant.operation_id) ?? grant.balance
    if (currentBalance <= 0) continue

    const consumeFromThisGrant = Math.min(remainingToConsume, currentBalance)
    const newBalance = currentBalance - consumeFromThisGrant

    // Track for potential debt creation
    lastConsumedGrant = grant
    effectiveBalances.set(grant.operation_id, newBalance)

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

  // If we still have remaining to consume, create debt
  // Note: We MUST create debt if remainingToConsume > 0, regardless of grant balance state
  if (remainingToConsume > 0 && grants.length > 0) {
    // Determine which grant to create debt on
    // Prefer the last grant we consumed from, otherwise use the last grant in the array
    const grantForDebt = lastConsumedGrant ?? grants[grants.length - 1]
    // Always use effectiveBalances map - it has post-modification values from both passes
    // Fall back to original balance only if grant was never modified
    const effectiveBalance =
      effectiveBalances.get(grantForDebt.operation_id) ?? grantForDebt.balance

    const newBalance = effectiveBalance - remainingToConsume
    await updateGrantBalance({
      ...params,
      grant: grantForDebt,
      consumed: remainingToConsume,
      newBalance,
    })
    consumed += remainingToConsume

    logger.warn(
      {
        userId,
        grantId: grantForDebt.operation_id,
        requested: remainingToConsume,
        consumed: remainingToConsume,
        newDebt: Math.abs(newBalance),
        effectiveBalanceBeforeDebt: effectiveBalance,
      },
      'Created new debt in grant',
    )
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
  // Include grants that expired after quotaResetDate to count their mid-cycle usage
  const grants = await getOrderedActiveGrants({
    ...withDefaults,
    includeExpiredSince: quotaResetDate,
  })

  const { usageThisCycle, balance, settlement } =
    calculateUsageAndBalanceFromGrants({
      grants,
      quotaResetDate,
      now,
      isPersonalContext,
    })

  // Perform in-memory settlement logging if needed
  if (settlement) {
    logger.debug(
      { userId, ...settlement },
      'Performing in-memory settlement',
    )
  }

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
