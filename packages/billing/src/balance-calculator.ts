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
 *
 * **Side effect:** mutates `grants[].balance` in-memory to reflect
 * post-consumption state. Callers must not reuse the array afterward
 * expecting original balances.
 *
 * **Debt model:** consumption never repays existing debt. Debt is only
 * cleared in `grant-credits.ts` (`executeGrantCreditOperation`) when
 * new credits are added. This function only deepens debt on overflow.
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

  // Consume from positive balances in priority order.
  // NOTE: debt grants (balance < 0) are skipped. Consumption never repays
  // debt; that only happens via grant-credits.ts when new credits arrive.
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

    // Mutate in-memory balance so the overflow check below sees
    // post-consumption state (not the stale original value).
    grant.balance = newBalance
  }

  // If we still have remaining to consume, create or extend debt on the
  // last grant. After the loop above all positive-balance grants are drained.
  // The "last grant" (lowest consumption priority, typically a subscription
  // grant that renews monthly) absorbs the overflow as debt.
  if (remainingToConsume > 0 && grants.length > 0) {
    const lastGrant = grants[grants.length - 1]
    const newBalance = lastGrant.balance - remainingToConsume

    await updateGrantBalance({
      ...params,
      grant: lastGrant,
      consumed: remainingToConsume,
      newBalance,
    })
    consumed += remainingToConsume
    lastGrant.balance = newBalance

    logger.warn(
      {
        userId,
        grantId: lastGrant.operation_id,
        requested: remainingToConsume,
        consumed: remainingToConsume,
        newDebt: Math.abs(newBalance),
      },
      'Created/extended debt in grant',
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
      includeSubscriptionCredits: boolean
      logger: Logger
    } & ParamsOf<typeof getOrderedActiveGrants>,
    'now' | 'conn' | 'isPersonalContext' | 'includeSubscriptionCredits'
  >,
): Promise<CreditUsageAndBalance> {
  const withDefaults = {
    now: new Date(),
    conn: db, // Add optional conn parameter to pass transaction
    isPersonalContext: false, // Add flag to exclude organization credits for personal usage
    includeSubscriptionCredits: false,
    ...params,
  }
  const { userId, quotaResetDate, now, isPersonalContext, includeSubscriptionCredits, logger } =
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

    // Skip organization credits for personal context
    if (isPersonalContext && grantType === 'organization') {
      continue
    }
    // Skip subscription credits for personal context unless explicitly included
    // (subscription credits are shown separately in the CLI with progress bars,
    // but need to be included for credit gating after ensureSubscriberBlockGrant)
    if (isPersonalContext && grantType === 'subscription' && !includeSubscriptionCredits) {
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
    eventId: crypto.randomUUID(),
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
  ttftMs: number | null

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
    ttftMs,

    logger,
  } = params

  const finishedAt = new Date()
  const latencyMs = finishedAt.getTime() - startTime.getTime()

  // Test sentinel: short-circuit both credit consumption and the message
  // insert. Matches prior behavior so agent-runtime unit tests that use this
  // sentinel as userId don't hit the DB.
  if (userId === TEST_USER_ID) {
    return success({
      consumed: 0,
      fromPurchased: 0,
      agentStepId: 'test-step-id',
    })
  }

  // Track grant state for error logging
  let activeGrantsSnapshot: Array<{
    operation_id: string
    balance: number
    type: string
    priority: number
    expires_at: Date | null
  }> = []
  let phase: 'fetch_grants' | 'consume_credits' | 'complete' = 'fetch_grants'

  // Billing transaction. Isolated from the message insert below so that a
  // billing failure never prevents us from recording that OpenRouter was paid.
  // OR bills us the moment the upstream request completes; the audit row must
  // exist regardless of whether we successfully charged the user.
  let consumeResult: CreditConsumptionResult | null = null
  let billingError: unknown = null
  let lockWaitMs: number | undefined
  let alreadyRecorded = false

  try {
    const txOut = await withAdvisoryLockTransaction({
      callback: async (tx): Promise<CreditConsumptionResult | null> => {
        activeGrantsSnapshot = []
        phase = 'fetch_grants'

        if (byok) return null

        // Idempotency: if we've already recorded this messageId (e.g. a retry
        // of the exact same upstream call), skip credit consumption. The
        // advisory lock is keyed by userId so this check is serialized per
        // user. messageId is globally unique in practice (OR generation id).
        const existing = await tx
          .select({ id: schema.message.id })
          .from(schema.message)
          .where(eq(schema.message.id, messageId))
          .limit(1)
        if (existing.length > 0) {
          alreadyRecorded = true
          return null
        }

        const now = new Date()
        const activeGrants = await getOrderedActiveGrantsForConsumption({
          ...params,
          now,
          conn: tx,
        })

        activeGrantsSnapshot = activeGrants.map((g) => ({
          operation_id: g.operation_id,
          balance: g.balance,
          type: g.type,
          priority: g.priority,
          expires_at: g.expires_at,
        }))

        if (activeGrants.length === 0) {
          // Non-fatal: user has no grants (not even a free one). Log loudly,
          // let the message insert proceed so we at least have an audit row.
          logger.error(
            { userId, credits, messageId },
            'No active grants found to consume credits from',
          )
          return null
        }

        phase = 'consume_credits'
        const result = await consumeFromOrderedGrants({
          ...params,
          creditsToConsume: credits,
          grants: activeGrants,
          tx,
        })
        phase = 'complete'
        return result
      },
      lockKey: `user:${userId}`,
      context: { userId, credits },
      logger,
    })
    consumeResult = txOut.result
    lockWaitMs = txOut.lockWaitMs
  } catch (error) {
    billingError = error
    logger.error(
      {
        error: getErrorObject(error),
        pgDetails: extractPostgresErrorDetails(error),
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
      'Error consuming credits; proceeding with message insert',
    )
  }

  // Idempotent replay: message row already exists. Skip the insert and the
  // post-billing side effects (Stripe metering already fired on the first
  // call; analytics were already emitted).
  if (alreadyRecorded) {
    logger.info(
      { messageId, userId, agentId },
      'Message already recorded; skipping duplicate consumeCreditsAndAddAgentStep',
    )
    return success({
      consumed: 0,
      fromPurchased: 0,
      agentStepId: crypto.randomUUID(),
    })
  }

  // Always record the message row. If billing failed, mark credits=0 so the
  // audit row still exists — the row being absent is how OR costs leaked before.
  const recordedCredits = billingError === null ? credits : 0

  try {
    await db
      .insert(schema.message)
      .values({
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
        credits: recordedCredits,
        byok,
        latency_ms: latencyMs,
        ttft_ms: ttftMs,
        user_id: userId,
      })
      .onConflictDoNothing({ target: schema.message.id })
  } catch (error) {
    logger.error(
      {
        messageId,
        userId,
        agentId,
        error: getErrorObject(error),
        pgDetails: extractPostgresErrorDetails(error),
      },
      'Failed to insert message row',
    )
  }

  if (billingError) {
    return failure(billingError)
  }

  const finalResult: CreditConsumptionResult =
    consumeResult ?? { consumed: 0, fromPurchased: 0 }

  logger.info(
    {
      userId,
      messageId,
      creditsConsumed: finalResult.consumed,
      creditsRequested: credits,
      fromPurchased: finalResult.fromPurchased,
      lockWaitMs,
      agentId,
      model,
    },
    'Credits consumed and agent step recorded',
  )

  trackEvent({
    event: AnalyticsEvent.CREDIT_CONSUMED,
    userId,
    properties: {
      creditsConsumed: finalResult.consumed,
      creditsRequested: credits,
      fromPurchased: finalResult.fromPurchased,
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
    purchasedCredits: finalResult.fromPurchased,
    logger,
    eventId: messageId,
    timestamp: finishedAt,
    extraPayload: {
      source: 'consumeCreditsAndAddAgentStep',
      message_id: messageId,
    },
  })

  const agentStepId =
    userId === TEST_USER_ID ? 'test-step-id' : crypto.randomUUID()
  return success({ ...finalResult, agentStepId })
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
