import { stripeServer } from '../util/stripe'
import { CREDITS_USAGE_LIMITS } from '../constants'
import db from '../db'
import * as schema from '../db/schema'
import { and, between, eq, SQL, sql } from 'drizzle-orm'
import { match } from 'ts-pattern'

type CheckQuotaResult = Promise<{
  creditsUsed: number
  quota: number
  endDate: Date
  subscription_active: boolean
  session_credits_used?: number
}>

export interface IQuotaManager {
  checkQuota(id: string): CheckQuotaResult
  setNextQuota(
    id: string,
    quota_exceeded: boolean,
    next_quota_reset: Date
  ): Promise<void>
}

export class AnonymousQuotaManager implements IQuotaManager {
  async checkQuota(
    fingerprintId: string,
    sessionId?: string
  ): CheckQuotaResult {
    const quota = CREDITS_USAGE_LIMITS.ANON
    const startDate: SQL<string> = sql<string>`COALESCE(${schema.fingerprint.next_quota_reset}, now()) - INTERVAL '1 month'`
    const endDate: SQL<string> = sql<string>`COALESCE(${schema.fingerprint.next_quota_reset}, now())`
    let session_credits_used: number | undefined = undefined

    const result = await db
      .select({
        creditsUsed: sql<string>`SUM(COALESCE(${schema.message.credits}, 0))`,
        endDate,
      })
      .from(schema.fingerprint)
      .leftJoin(
        schema.message,
        and(
          eq(schema.message.fingerprint_id, fingerprintId),
          between(schema.message.finished_at, startDate, endDate)
        )
      )
      .where(eq(schema.fingerprint.id, fingerprintId))
      .groupBy(schema.fingerprint.next_quota_reset)
      .then((rows) => {
        if (rows.length > 0) return rows[0]
        return {
          creditsUsed: '0',
          endDate: new Date().toDateString(),
        }
      })

    if (sessionId) {
      session_credits_used = await db
        .select({
          client_id: schema.message.client_id,
          fingerprint_id: schema.message.fingerprint_id,
          sessionCreditsUsed: sql<string>`SUM(COALESCE(${schema.message.credits}, 0))`,
        })
        .from(schema.message)
        .where(
          and(
            eq(schema.message.client_id, sessionId),
            eq(schema.message.fingerprint_id, fingerprintId)
          )
        )
        .groupBy(schema.message.client_id, schema.message.fingerprint_id)
        .then((rows) => {
          if (rows.length > 0) {
            return parseInt(rows[0].sessionCreditsUsed)
          }
          return 0
        })
    }

    return {
      creditsUsed: parseInt(result.creditsUsed),
      quota,
      endDate: new Date(result.endDate),
      subscription_active: false,
      session_credits_used,
    }
  }

  async setNextQuota(
    fingerprintId: string,
    quota_exceeded: boolean,
    next_quota_reset: Date
  ): Promise<void> {
    await db
      .update(schema.fingerprint)
      .set({
        quota_exceeded,
        next_quota_reset,
      })
      .where(eq(schema.fingerprint.id, fingerprintId))
  }
}

export class AuthenticatedQuotaManager implements IQuotaManager {
  async getStripeSubscriptionQuota(
    userId: string
  ): Promise<{ quota: number; overageRate: number | null }> {
    // Get user's subscription from Stripe
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        stripe_customer_id: true,
        stripe_price_id: true,
      },
    })

    let overageRate: number | null = null
    let quota = CREDITS_USAGE_LIMITS.PRO
    if (user?.stripe_customer_id && user?.stripe_price_id) {
      const subscriptions = await stripeServer.subscriptions.list({
        customer: user.stripe_customer_id,
        status: 'active',
        limit: 1,
      })

      if (subscriptions.data[0]?.id) {
        const subscription = await stripeServer.subscriptions.retrieve(
          subscriptions.data[0].id,
          {
            expand: ['items.data.price.tiers'],
          }
        )

        // Get the metered price item which contains our overage rate
        const meteredPrice = subscription.items.data.find(
          (item) => item.price.recurring?.usage_type === 'metered'
        )

        if (meteredPrice?.price.tiers) {
          for (const tier of meteredPrice.price.tiers) {
            if (tier.up_to) {
              quota = Math.max(quota, tier.up_to)
            }
            if (tier.up_to === null && tier.unit_amount_decimal) {
              overageRate = parseFloat(tier.unit_amount_decimal)
              break
            }
          }
        }
      }
    }

    return { quota, overageRate }
  }

  async checkQuota(userId: string, sessionId?: string): CheckQuotaResult {
    const startDate: SQL<string> = sql<string>`COALESCE(${schema.user.next_quota_reset}, now()) - INTERVAL '1 month'`
    const endDate: SQL<string> = sql<string>`COALESCE(${schema.user.next_quota_reset}, now())`
    let session_credits_used = undefined

    const result = await db
      .select({
        quota: schema.user.quota,
        stripe_customer_id: schema.user.stripe_customer_id,
        stripe_price_id: schema.user.stripe_price_id,
        subscription_active: schema.user.subscription_active,
        endDate,
        creditsUsed: sql<string>`SUM(COALESCE(${schema.message.credits}, 0))`,
      })
      .from(schema.user)
      .leftJoin(
        schema.message,
        and(
          eq(schema.message.user_id, schema.user.id),
          between(schema.message.finished_at, startDate, endDate)
        )
      )
      .where(eq(schema.user.id, userId))
      .groupBy(
        schema.user.quota,
        schema.user.stripe_customer_id,
        schema.user.stripe_price_id,
        schema.user.subscription_active,
        schema.user.next_quota_reset
      )
      .then((rows) => {
        if (rows.length > 0) return rows[0]
        return {
          quota: 0,
          stripe_customer_id: null,
          stripe_price_id: null,
          creditsUsed: '0',
          endDate: new Date().toDateString(),
          subscription_active: false,
        }
      })

    if (sessionId) {
      session_credits_used = await db
        .select({
          client_id: schema.message.client_id,
          user_id: schema.message.user_id,
          sessionCreditsUsed: sql<string>`SUM(COALESCE(${schema.message.credits}, 0))`,
        })
        .from(schema.message)
        .where(
          and(
            eq(schema.message.client_id, sessionId),
            eq(schema.message.user_id, userId)
          )
        )
        .groupBy(schema.message.client_id, schema.message.user_id)
        .then((rows) => {
          if (rows.length > 0) {
            return parseInt(rows[0].sessionCreditsUsed)
          }
          return 0
        })
    }

    const quota =
      !result?.stripe_customer_id && !result?.stripe_price_id
        ? CREDITS_USAGE_LIMITS.FREE
        : result?.quota ?? CREDITS_USAGE_LIMITS.FREE

    return {
      creditsUsed: parseInt(result.creditsUsed),
      quota,
      endDate: new Date(result.endDate),
      subscription_active: !!result.subscription_active,
      session_credits_used,
    }
  }

  async setNextQuota(
    userId: string,
    quota_exceeded: boolean,
    next_quota_reset: Date
  ): Promise<void> {
    await db
      .update(schema.user)
      .set({
        quota_exceeded,
        next_quota_reset,
      })
      .where(eq(schema.user.id, userId))
  }
}

export type AuthType = 'anonymous' | 'authenticated'

export const getQuotaManager = (authType: AuthType, id: string) => {
  const manager = match(authType)
    .with('anonymous', () => new AnonymousQuotaManager())
    .with('authenticated', () => new AuthenticatedQuotaManager())
    .exhaustive()

  return {
    checkQuota: (sessionId?: string) => manager.checkQuota(id, sessionId),
    setNextQuota: (quota_exceeded: boolean, next_quota_reset: Date) =>
      manager.setNextQuota(id, quota_exceeded, next_quota_reset),
  }
}
