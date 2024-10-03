import { models } from 'common/constants'
import { OpenAIMessage } from '@/openai-api'
import { Message } from 'common/actions'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, between, eq, or, SQL, sql } from 'drizzle-orm'
import { getNextQuotaReset } from 'common/util/dates'

const PROFIT_MARGIN = 0.2

// Pricing details:
// - https://www.anthropic.com/pricing#anthropic-api
// - https://openai.com/pricing
const TOKENS_COST_PER_M = {
  input: {
    [models.sonnet]: 3,
    [models.haiku]: 0.25,
    [models.gpt4o]: 2.5,
    [models.gpt4omini]: 0.15,
  },
  output: {
    [models.sonnet]: 15,
    [models.haiku]: 1.25,
    [models.gpt4o]: 10.0,
    [models.gpt4omini]: 0.6,
  },
  cache_creation: {
    [models.sonnet]: 3.75,
    [models.haiku]: 0.3,
  },
  cache_read: {
    [models.sonnet]: 0.3,
    [models.haiku]: 0.03,
  },
}

export const saveMessage = async (value: {
  messageId: string
  userId?: string
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: string
  request: Message[] | OpenAIMessage[]
  response: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  finishedAt: Date
}) => {
  const cost = calcCost(
    value.model,
    value.inputTokens,
    value.outputTokens,
    value.cacheCreationInputTokens ?? 0,
    value.cacheReadInputTokens ?? 0
  )

  const creditsUsed = Math.round(cost * 100 * (1 + PROFIT_MARGIN))

  return db.insert(schema.message).values({
    id: value.messageId,
    user_id: value.userId,
    fingerprint_id: value.fingerprintId,
    client_id: value.clientSessionId,
    client_request_id: value.userInputId,
    model: value.model,
    request: value.request,
    response: value.response,
    input_tokens: value.inputTokens,
    output_tokens: value.outputTokens,
    cache_creation_input_tokens: value.cacheCreationInputTokens,
    cache_read_input_tokens: value.cacheReadInputTokens,
    cost: cost.toString(),
    credits: creditsUsed,
    finished_at: value.finishedAt,
  })
}

export const setQuotaExceeded = async (
  fingerprintId: string,
  userId?: string
) => {
  if (userId) {
    // Signed-in user
    const nextQuotaReset = await db
      .select({
        next_quota_reset: schema.user.next_quota_reset,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .then((users) => {
        if (users.length === 1) {
          return users[0].next_quota_reset
        }
        return null
      })

    // Now, we have a date in the future, so we can set the quota
    await db
      .update(schema.user)
      .set({
        quota_exceeded: true,
        next_quota_reset: getNextQuotaReset(nextQuotaReset),
      })
      .where(eq(schema.user.id, userId))
    return
  } else {
    // Anonymous user
    const nextQuotaReset = await db
      .select({
        next_quota_reset: schema.fingerprint.next_quota_reset,
      })
      .from(schema.fingerprint)
      .where(eq(schema.fingerprint.id, fingerprintId))
      .then((fingerprints) => {
        if (fingerprints.length === 1) {
          return fingerprints[0].next_quota_reset
        }
        return null
      })

    await db
      .update(schema.fingerprint)
      .set({
        quota_exceeded: true,
        next_quota_reset: getNextQuotaReset(nextQuotaReset),
      })
      .where(eq(schema.fingerprint.id, fingerprintId))
  }
}

const getPerTokenCost = (
  model: string,
  type: keyof typeof TOKENS_COST_PER_M
): number => {
  // @ts-ignore
  return (TOKENS_COST_PER_M[type][model] ?? 0) / 1_000_000
}

const calcCost = (
  model: string,
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens: number,
  cache_read_input_tokens: number
) => {
  return (
    input_tokens * getPerTokenCost(model, 'input') +
    output_tokens * getPerTokenCost(model, 'output') +
    cache_creation_input_tokens * getPerTokenCost(model, 'cache_creation') +
    cache_read_input_tokens * getPerTokenCost(model, 'cache_read')
  )
}

export const updateQuota = async (
  fingerprintId: string,
  userId?: string
): Promise<{
  creditsUsed: number
  quota: number
  // userId?: string
  // endDate: Date | SQL<Date>
  // quotaExceeded: boolean
}> => {
  const { creditsUsed, quota, endDate } = await checkQuota(fingerprintId)

  if (creditsUsed >= quota) {
    setQuotaExceeded(fingerprintId, userId)
    return {
      creditsUsed,
      quota,
    }
  }
  return {
    creditsUsed,
    quota,
  }
}

export const checkQuota = async (
  fingerprintId: string
): Promise<{
  creditsUsed: number
  quota: number
  userId?: string
  endDate: Date | SQL<Date>
}> => {
  // Default case: anonymous user
  let quota = CREDITS_USAGE_LIMITS.ANON
  let startDate: Date | SQL<Date> =
    sql<Date>`COALESCE(${schema.user.next_quota_reset}, ${schema.fingerprint.next_quota_reset}, now()) - INTERVAL '1 month'`
  let endDate: Date | SQL<Date> =
    sql<Date>`COALESCE(${schema.user.next_quota_reset}, ${schema.fingerprint.next_quota_reset}, now())`

  const result = await db
    .select({
      id: schema.user.id,
      quota: schema.user.quota,
      stripe_customer_id: schema.user.stripe_customer_id,
      stripe_price_id: schema.user.stripe_price_id,
      credits: sql<number>`SUM(COALESCE(${schema.message.credits}, 0))`,
    })
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .leftJoin(
      schema.fingerprint,
      eq(schema.session.fingerprint_id, fingerprintId)
    )
    .leftJoin(
      schema.message,
      and(
        or(
          eq(schema.message.fingerprint_id, fingerprintId),
          eq(schema.message.user_id, schema.user.id)
        ),
        between(schema.message.finished_at, startDate, endDate)
      )
    )
    .where(eq(schema.session.fingerprint_id, fingerprintId))
    .groupBy(
      schema.user.id,
      schema.user.quota,
      schema.user.stripe_customer_id,
      schema.user.stripe_price_id
    )
    .limit(1)
    .then((rows) => rows[0])

  if (result) {
    quota =
      // TODO: check the type of plan they're on instead of assuming they're the free tier
      !result.stripe_customer_id && !result.stripe_price_id
        ? CREDITS_USAGE_LIMITS.FREE
        : result.quota
  }

  return {
    creditsUsed: result?.credits ?? 0,
    quota,
    userId: result?.id,
    endDate,
  }
}

export const resetQuota = async (fingerprintId: string, userId?: string) => {
  if (userId) {
    // Signed-in user
    await db
      .update(schema.user)
      .set({ quota_exceeded: false, next_quota_reset: null })
      .where(eq(schema.user.id, userId))
  } else {
    // Anonymous user
    await db
      .update(schema.fingerprint)
      .set({
        quota_exceeded: false,
        next_quota_reset: null,
      })
      .where(eq(schema.fingerprint.id, fingerprintId))
  }
}
