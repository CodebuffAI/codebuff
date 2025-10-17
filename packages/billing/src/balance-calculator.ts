import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { withSerializableTransaction } from '@codebuff/common/db/transaction'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { GrantTypeValues } from '@codebuff/common/types/grant'
import { failure, success } from '@codebuff/common/util/error'
import { and, asc, gt, isNull, or, eq, sql } from 'drizzle-orm'

import type { GrantType } from '@codebuff/common/db/schema'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
  OptionalFields,
} from '@codebuff/common/types/function-params'
import type { ErrorOr } from '@codebuff/common/util/error'

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

/**
 * Gets active grants for a user, ordered by expiration (soonest first), then priority, and creation date.
 * Added optional `conn` param so callers inside a transaction can supply their TX object.
 */
export async function getOrderedActiveGrants(params: {
  userId: string
  now: Date
  conn?: DbConn // use DbConn instead of typeof db
}) {
  const { userId, now, conn = db } = params
  return conn
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.user_id, userId),
        or(
          isNull(schema.creditLedger.expires_at),
          gt(schema.creditLedger.expires_at, now),
        ),
      ),
    )
    .orderBy(
      // Use grants based on priority, then expiration date, then creation date
      asc(schema.creditLedger.priority),
      asc(schema.creditLedger.expires_at),
      asc(schema.creditLedger.created_at),
    )
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

    // Skip organization credits for personal context
    if (isPersonalContext && grantType === 'organization') {
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
      balance,
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
 * Uses SERIALIZABLE isolation to prevent concurrent modifications that could lead to
 * incorrect credit usage (e.g., "double spending" credits).
 *
 * @param userId The ID of the user
 * @param creditsToConsume Number of credits being consumed
 * @returns Promise resolving to number of credits consumed
 */
export async function consumeCredits(params: {
  userId: string
  creditsToConsume: number
  logger: Logger
}): Promise<CreditConsumptionResult> {
  const { userId, creditsToConsume, logger } = params

  return await withSerializableTransaction({
    callback: async (tx) => {
      const now = new Date()
      const activeGrants = await getOrderedActiveGrants({
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

      const result = await consumeFromOrderedGrants({
        ...params,
        creditsToConsume,
        grants: activeGrants,
        tx,
      })

      return result
    },
    context: { userId, creditsToConsume },
    logger,
  })
}

export async function consumeCreditsAndAddAgentStep(params: {
  messageId: string
  userId: string
  agentId: string
  clientId: string | null
  clientRequestId: string | null

  startTime: Date

  model: string
  reasoningText: string
  response: string

  cost: number
  credits: number

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

    inputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    reasoningTokens,
    outputTokens,

    logger,
  } = params

  const finishedAt = new Date()
  const latencyMs = finishedAt.getTime() - startTime.getTime()

  try {
    return success(
      await withSerializableTransaction({
        callback: async (tx) => {
          const now = new Date()
          const activeGrants = await getOrderedActiveGrants({
            ...params,
            now,
            conn: tx,
          })

          if (activeGrants.length === 0) {
            logger.error(
              { userId, credits },
              'No active grants found to consume credits from',
            )
            throw new Error('No active grants found')
          }

          const result = await consumeFromOrderedGrants({
            ...params,
            creditsToConsume: credits,
            grants: activeGrants,
            tx,
          })

          if (userId === TEST_USER_ID) {
            return { ...result, agentStepId: 'test-step-id' }
          }
          const stepId = crypto.randomUUID()

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
              latency_ms: latencyMs,
              user_id: userId,
            })
          } catch (error) {
            logger.error({ ...params, error }, 'Failed to add message')
            throw error
          }

          return { ...result, agentStepId: stepId }
        },
        context: { userId, credits },
        logger,
      }),
    )
  } catch (error) {
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
