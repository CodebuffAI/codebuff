import { CREDITS_USAGE_LIMITS } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, between, eq, or, SQL, sql } from 'drizzle-orm'
import { getNextQuotaReset } from 'common/util/dates'
import { match } from 'ts-pattern'

export interface IQuotaManager {
  updateQuota(id: string): Promise<{
    creditsUsed: number
    quota: number
  }>
  checkQuota(id: string): Promise<{
    creditsUsed: number
    quota: number
    endDate: Date | SQL<Date>
  }>
  resetQuota(id: string): Promise<void>
}

export class AnonymousQuotaManager implements IQuotaManager {
  async updateQuota(fingerprintId: string): Promise<{
    creditsUsed: number
    quota: number
  }> {
    const { creditsUsed, quota, endDate } = await this.checkQuota(fingerprintId)

    if (creditsUsed >= quota) {
      await this.setQuotaExceeded(fingerprintId)
    }
    return {
      creditsUsed,
      quota,
    }
  }

  async checkQuota(fingerprintId: string): Promise<{
    creditsUsed: number
    quota: number
    endDate: Date | SQL<Date>
  }> {
    const quota = CREDITS_USAGE_LIMITS.ANON
    const startDate: SQL<Date> = sql<Date>`COALESCE(${schema.fingerprint.next_quota_reset}, now()) - INTERVAL '1 month'`
    const endDate: SQL<Date> = sql<Date>`COALESCE(${schema.fingerprint.next_quota_reset}, now())`

    const result = await db
      .select({
        credits: sql<number>`SUM(COALESCE(${schema.message.credits}, 0))`,
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
      .then((rows) => {
        if (rows.length > 0) return rows[0]
        return
      })

    return {
      creditsUsed: result?.credits ?? 0,
      quota,
      endDate,
    }
  }

  async resetQuota(fingerprintId: string): Promise<void> {
    await db
      .update(schema.fingerprint)
      .set({
        quota_exceeded: false,
        next_quota_reset: null,
      })
      .where(eq(schema.fingerprint.id, fingerprintId))
  }

  private async setQuotaExceeded(fingerprintId: string): Promise<void> {
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

export class AuthenticatedQuotaManager implements IQuotaManager {
  async updateQuota(userId: string): Promise<{
    creditsUsed: number
    quota: number
  }> {
    const { creditsUsed, quota, endDate } = await this.checkQuota(userId)

    if (creditsUsed >= quota) {
      await this.setQuotaExceeded(userId)
    }
    return {
      creditsUsed,
      quota,
    }
  }

  async checkQuota(userId: string): Promise<{
    creditsUsed: number
    quota: number
    endDate: Date | SQL<Date>
  }> {
    const startDate: SQL<Date> = sql<Date>`COALESCE(${schema.user.next_quota_reset}, now()) - INTERVAL '1 month'`
    const endDate: SQL<Date> = sql<Date>`COALESCE(${schema.user.next_quota_reset}, now())`

    const result = await db
      .select({
        quota: schema.user.quota,
        stripe_customer_id: schema.user.stripe_customer_id,
        stripe_price_id: schema.user.stripe_price_id,
        credits: sql<number>`SUM(COALESCE(${schema.message.credits}, 0))`,
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
        schema.user.stripe_price_id
      )
      .then((rows) => {
        if (rows.length > 0) return rows[0]
        return
      })

    const quota =
      !result?.stripe_customer_id && !result?.stripe_price_id
        ? CREDITS_USAGE_LIMITS.FREE
        : result?.quota ?? CREDITS_USAGE_LIMITS.FREE

    return {
      creditsUsed: result?.credits ?? 0,
      quota,
      endDate,
    }
  }

  async resetQuota(userId: string): Promise<void> {
    await db
      .update(schema.user)
      .set({ quota_exceeded: false, next_quota_reset: null })
      .where(eq(schema.user.id, userId))
  }

  private async setQuotaExceeded(userId: string): Promise<void> {
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

    await db
      .update(schema.user)
      .set({
        quota_exceeded: true,
        next_quota_reset: getNextQuotaReset(nextQuotaReset),
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
    updateQuota: () => manager.updateQuota(id),
    checkQuota: () => manager.checkQuota(id),
    resetQuota: () => manager.resetQuota(id),
  }
}
