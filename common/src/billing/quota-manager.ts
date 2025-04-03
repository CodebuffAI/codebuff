import { stripeServer, getCurrentSubscription } from '../util/stripe'
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
  checkQuota(id: string, sessionId?: string): CheckQuotaResult
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
    const userResult = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        id: true,
        quota: true,
        stripe_customer_id: true,
        stripe_price_id: true,
        subscription_active: true,
        next_quota_reset: true,
      },
    })

    if (!userResult) {
      return {
        creditsUsed: 0,
        quota: CREDITS_USAGE_LIMITS.FREE,
        endDate: new Date(),
        subscription_active: false,
        session_credits_used: 0,
      }
    }

    let startDate: Date
    let endDate: Date
    let subscription_active = userResult.subscription_active

    if (subscription_active && userResult.stripe_customer_id) {
      try {
        const subscription = await getCurrentSubscription(
          userResult.stripe_customer_id
        )
        if (subscription && subscription.status === 'active') {
          startDate = new Date(subscription.current_period_start * 1000)
          endDate = new Date(subscription.current_period_end * 1000)
          subscription_active = true
        } else {
          console.warn(
            `Subscription discrepancy for user ${userId}. DB says active, Stripe says ${subscription?.status}. Falling back to next_quota_reset.`
          )
          subscription_active = false
          const fallbackEndDate = userResult.next_quota_reset ?? new Date()
          endDate = new Date(fallbackEndDate)
          startDate = new Date(endDate)
          startDate.setMonth(startDate.getMonth() - 1)
        }
      } catch (error) {
        console.error(
          `Error fetching Stripe subscription for user ${userId}:`,
          error
        )
        subscription_active = false
        const fallbackEndDate = userResult.next_quota_reset ?? new Date()
        endDate = new Date(fallbackEndDate)
        startDate = new Date(endDate)
        startDate.setMonth(startDate.getMonth() - 1)
      }
    } else {
      const fallbackEndDate = userResult.next_quota_reset ?? new Date()
      endDate = new Date(fallbackEndDate)
      startDate = new Date(endDate)
      startDate.setMonth(startDate.getMonth() - 1)
      if (subscription_active) {
        subscription_active = false
      }
    }

    let session_credits_used = undefined

    const creditsUsed = await db
      .select({
        creditsUsed: sql<string>`SUM(COALESCE(${schema.message.credits}, 0))`,
      })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.user_id, userId),
          between(schema.message.finished_at, startDate, endDate)
        )
      )
      .then((rows) => parseInt(rows[0].creditsUsed ?? '0'))

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
      !userResult.stripe_customer_id && !userResult.stripe_price_id
        ? CREDITS_USAGE_LIMITS.FREE
        : userResult.quota ?? CREDITS_USAGE_LIMITS.FREE

    return {
      creditsUsed,
      quota,
      endDate,
      subscription_active,
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
