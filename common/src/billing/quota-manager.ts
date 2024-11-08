import { CREDITS_USAGE_LIMITS } from '../constants'
import db from '../db'
import * as schema from '../db/schema'
import { and, between, eq, or, SQL, sql } from 'drizzle-orm'
import { getNextQuotaReset } from '../util/dates'
import { match } from 'ts-pattern'

export interface IQuotaManager {
  updateQuota(id: string): Promise<{
    creditsUsed: number
    quota: number
    subscription_active: boolean
  }>
  checkQuota(id: string): Promise<{
    creditsUsed: number
    quota: number
    endDate: Date
    subscription_active: boolean
  }>
  setNextQuota(id: string, quota_exceeded: boolean): Promise<Date>
}

export class AnonymousQuotaManager implements IQuotaManager {
  async updateQuota(fingerprintId: string) {
    const { creditsUsed, quota, endDate } = await this.checkQuota(fingerprintId)

    await this.setNextQuota(fingerprintId, endDate >= new Date())

    return {
      creditsUsed,
      quota,
      subscription_active: false,
    }
  }

  async checkQuota(fingerprintId: string): Promise<{
    creditsUsed: number
    quota: number
    endDate: Date
    subscription_active: boolean
  }> {
    const quota = CREDITS_USAGE_LIMITS.ANON
    const startDate: SQL<string> = sql<string>`COALESCE(${schema.fingerprint.next_quota_reset}, now()) - INTERVAL '1 month'`
    const endDate: SQL<string> = sql<string>`COALESCE(${schema.fingerprint.next_quota_reset}, now())`

    const result = await db
      .select({
        creditsUsed: sql<number>`SUM(COALESCE(${schema.message.credits}, 0))`,
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
          creditsUsed: 0,
          quota,
          endDate: new Date().toDateString(),
        }
      })

    return {
      creditsUsed: result.creditsUsed,
      quota,
      endDate: new Date(result.endDate),
      subscription_active: false,
    }
  }

  async setNextQuota(
    fingerprintId: string,
    quota_exceeded: boolean
  ): Promise<Date> {
    const quotaReset = await db
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

    const nextQuotaReset = getNextQuotaReset(quotaReset)

    await db
      .update(schema.fingerprint)
      .set({
        quota_exceeded,
        next_quota_reset: nextQuotaReset,
      })
      .where(eq(schema.fingerprint.id, fingerprintId))

    return nextQuotaReset
  }
}

export class AuthenticatedQuotaManager implements IQuotaManager {
  async updateQuota(userId: string) {
    const { creditsUsed, quota, subscription_active, endDate } =
      await this.checkQuota(userId)

    await this.setNextQuota(
      userId,
      !subscription_active && endDate >= new Date()
    )
    return {
      creditsUsed,
      quota,
      subscription_active,
    }
  }

  async checkQuota(userId: string) {
    const startDate: SQL<string> = sql<string>`COALESCE(${schema.user.next_quota_reset}, now()) - INTERVAL '1 month'`
    const endDate: SQL<string> = sql<string>`COALESCE(${schema.user.next_quota_reset}, now())`

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
        schema.user.next_quota_reset,
        schema.user.subscription_active
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

    const quota =
      !result?.stripe_customer_id && !result?.stripe_price_id
        ? CREDITS_USAGE_LIMITS.FREE
        : result?.quota ?? CREDITS_USAGE_LIMITS.FREE

    return {
      creditsUsed: parseInt(result.creditsUsed),
      quota,
      endDate: new Date(result.endDate),
      subscription_active: !!result.subscription_active,
    }
  }

  async setNextQuota(userId: string, quota_exceeded: boolean): Promise<Date> {
    const quotaReset = await db
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

    const nextQuotaReset = getNextQuotaReset(quotaReset)
    await db
      .update(schema.user)
      .set({
        quota_exceeded,
        next_quota_reset: nextQuotaReset,
      })
      .where(eq(schema.user.id, userId))

    return nextQuotaReset
  }
}

export type AuthType = 'anonymous' | 'authenticated'

export const getQuotaManager = (authType: AuthType, id: string) => {
  const manager = match(authType)
    .with('anonymous', () => new AnonymousQuotaManager())
    .with('authenticated', () => new AuthenticatedQuotaManager())
    .exhaustive()

  return {
    updateQuota: () => manager.updateQuota(id),
    checkQuota: () => manager.checkQuota(id),
    setNextQuota: (quota_exceeded: boolean) =>
      manager.setNextQuota(id, quota_exceeded),
  }
}
