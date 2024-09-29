import { models } from 'common/constants'
import { OpenAIMessage } from '@/openai-api'
import { Message } from 'common/actions'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { stripeServer } from 'common/util/stripe'
import { and, between, eq, or, SQL, sql } from 'drizzle-orm'

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
  fingerprintId: string
  model: string
  context: Message[] | OpenAIMessage[]
  request: Message | OpenAIMessage
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
    model: value.model,
    context: value.context,
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

const getNextQuotaReset = (currentQuotaReset: Date | null): Date => {
  let nextMonth = currentQuotaReset ?? new Date()
  while (nextMonth < new Date()) {
    nextMonth.setMonth(nextMonth.getMonth() + 1)
  }
  return nextMonth
}

export const limitFingerprint = async (
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

  // Check if Stripe customer; they have different quotas
  const user = await db
    .select({
      id: schema.user.id,
      stripe_customer_id: schema.user.stripe_customer_id,
      stripe_price_id: schema.user.stripe_price_id,
      fingerprintId: schema.session.fingerprint_id,
    })
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .leftJoin(
      schema.fingerprint,
      eq(schema.session.fingerprint_id, schema.fingerprint.id)
    )
    .where(eq(schema.session.fingerprint_id, fingerprintId))
    .then((users) => {
      if (users.length === 1) {
        return users[0]
      }
      return null
    })
  if (user && user.stripe_customer_id) {
    const customer = await stripeServer.customers.retrieve(
      user.stripe_customer_id
    )
    if (!customer.deleted) {
      quota = parseInt(customer.metadata.quota, CREDITS_USAGE_LIMITS.FREE)

      if (user.stripe_price_id) {
        // TODO: refactor this to use max/min fns
        customer.subscriptions?.data?.forEach((subscription) => {
          const newStartDate = new Date(
            subscription.current_period_start * 1000
          )
          if (startDate < newStartDate) {
            // Be generous if there are multiple subscriptions – take the most recent start period
            startDate = newStartDate
          }

          const newEndDate = new Date(subscription.current_period_end * 1000)
          if (newEndDate > startDate) {
            // Be generous if there are multiple subscriptions – take the most recent end period
            endDate = newEndDate
          }
        })
      }
    }
  }

  const creditsUsed = await db
    .select({
      credits: sql<number>`SUM(COALESCE(${schema.message.credits}, 0))`,
    })
    .from(schema.message)
    .leftJoin(schema.user, eq(schema.message.user_id, schema.user.id))
    .leftJoin(
      schema.fingerprint,
      eq(schema.message.fingerprint_id, schema.fingerprint.id)
    )
    .where(
      and(
        or(
          eq(schema.message.fingerprint_id, fingerprintId),
          ...[user ? eq(schema.message.user_id, user.id) : sql<boolean>`FALSE`]
        ),
        between(schema.message.finished_at, startDate, endDate)
      )
    )
    .limit(1)
    .then((messages) => {
      if (messages.length === 1) {
        return messages[0].credits
      }
      return 0
    })

  return {
    creditsUsed,
    quota,
    userId: user?.id,
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
