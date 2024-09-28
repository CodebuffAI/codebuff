import { OpenAIMessage } from '@/openai-api'
import { Message } from 'common/actions'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { stripeServer } from 'common/util/stripe'
import { and, between, eq, SQL, sql } from 'drizzle-orm'

const PROFIT_MARGIN = 0.2

const TOKEN_COSTS = {
  input: {
    'gpt-4o-2024-08-06': 0.002,
    'claude-3-5-sonnet-20240620': 0.002,
    'claude-3-haiku-20240307': 0.002,
    'gpt-4-32k-20230511': 0.002,
    'gpt-3.5-turbo-20230511': 0.002,
    'gpt-3.5-turbo-16k-20230511': 0.002,
  },
  output: {
    'gpt-4o-2024-08-06': 0.002,
    'claude-3-5-sonnet-20240620': 0.002,
    'claude-3-haiku-20240307': 0.002,
    'gpt-4-32k-20230511': 0.002,
    'gpt-3.5-turbo-20230511': 0.002,
    'gpt-3.5-turbo-16k-20230511': 0.002,
  },
  cache_creation: {
    'claude-3-5-sonnet-20240620': 0.002,
    'claude-3-haiku-20240307': 0.002,
  },
  cache_read: {
    'claude-3-5-sonnet-20240620': 0.002,
    'claude-3-haiku-20240307': 0.002,
  },
}

export const saveMessage = async ({
  messageId,
  userId,
  fingerprintId,
  model,
  request,
  response,
  inputTokens,
  outputTokens,
  finishedAt,
}: {
  messageId: string
  userId?: string
  fingerprintId: string
  model: string
  request: Message[] | OpenAIMessage[]
  response: string
  inputTokens: number
  outputTokens: number
  finishedAt: Date
}) =>
  db.insert(schema.message).values({
    id: messageId,
    user_id: userId,
    fingerprint_id: fingerprintId,
    model,
    request: request,
    response: response,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    finished_at: finishedAt,
  })

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

const calcCreditsUsed = async (
  totalsByModel: {
    model: string
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }[]
) => {
  let totalCreditsUsed = 0
  for (const {
    model,
    input_tokens,
    output_tokens,
    cache_creation_input_tokens,
    cache_read_input_tokens,
  } of totalsByModel) {
    const inputCredits =
      // @ts-ignore
      (TOKEN_COSTS.input[model] ?? 0) * input_tokens
    const outputCredits =
      // @ts-ignore
      (TOKEN_COSTS.output[model] ?? 0) * output_tokens
    const cacheCreationCredits =
      // @ts-ignore
      (TOKEN_COSTS.cache_creation[model] ?? 0) * cache_creation_input_tokens
    const cacheReadCredits =
      // @ts-ignore
      (TOKEN_COSTS.cache_read[model] ?? 0) * cache_read_input_tokens

    totalCreditsUsed +=
      inputCredits + outputCredits + cacheCreationCredits + cacheReadCredits
  }
  return totalCreditsUsed * (1 + PROFIT_MARGIN)
}

export const checkQuota = async (
  fingerprintId: string
): Promise<{
  creditsUsed: number
  quota: number
  userId?: string
}> => {
  // Default case: anonymous user
  let quota = CREDITS_USAGE_LIMITS.ANON
  let startDate: Date | SQL<Date> =
    sql<Date>`${schema.user.next_quota_reset} - INTERVAL '1 month'`
  let endDate: Date | SQL<Date> = sql<Date>`${schema.user.next_quota_reset}`

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

  const totalsByModel = await db
    .select({
      model: schema.message.model,
      input_tokens: sql<number>`SUM(COALESCE(${schema.message.input_tokens}, 0))`,
      output_tokens: sql<number>`SUM(COALESCE(${schema.message.output_tokens}, 0))`,
      cache_creation_input_tokens: sql<number>`SUM(COALESCE(${schema.message.cache_creation_input_tokens}, 0))`,
      cache_read_input_tokens: sql<number>`SUM(COALESCE(${schema.message.cache_read_input_tokens}, 0))`,
    })
    .from(schema.message)
    .leftJoin(schema.user, eq(schema.message.user_id, schema.user.id))
    .leftJoin(
      schema.fingerprint,
      eq(schema.message.fingerprint_id, schema.fingerprint.id)
    )
    .where(
      and(
        eq(schema.message.fingerprint_id, fingerprintId),
        between(schema.message.finished_at, startDate, endDate)
      )
    )
    .groupBy(schema.message.model)

  const creditsUsed = await calcCreditsUsed(totalsByModel)
  return { creditsUsed, quota, userId: user?.id }
}
