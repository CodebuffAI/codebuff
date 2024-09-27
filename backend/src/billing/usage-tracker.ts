import db from 'common/src/db'
import * as schema from 'common/src/db/schema'
import type { UsageType } from 'common/src/db/schema'
import { eq, sql, and, gte, lte, or } from 'drizzle-orm'
import { TOKEN_USAGE_LIMITS } from 'common/src/constants'
import { match, P } from 'ts-pattern'

export interface Usage {
  type: UsageType
  used: number
  limit: number
}

export class UsageTracker {
  async addTokens(fingerprintId: string, tokens: number) {
    const now = new Date()
    const oneMonthLater = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    // Check if the user is logged in by trying to get their userId
    // TODO: pass this in from caller, since the user should have passed it in anyway
    const userSession = await db
      .select({
        userId: schema.user.id,
        fingerprintId: schema.fingerprint.id,
      })
      .from(schema.fingerprint)
      .leftJoin(schema.usage, eq(schema.usage.id, schema.fingerprint.usageId))
      .leftJoin(schema.user, eq(schema.usage.id, schema.user.usageId))
      .where(eq(schema.fingerprint.id, fingerprintId))
      .limit(1)
      .then((sessions) => {
        if (sessions.length === 1) {
          return sessions[0]
        }
        return null
      })

    // Create or update the usage record for the user
    await db.transaction(async (tx) => {
      const usageRecord = await tx
        .select({
          id: schema.usage.id,
        })
        .from(schema.usage)
        .where(
          and(lte(schema.usage.startDate, now), gte(schema.usage.endDate, now))
        )
        .then((usages) => {
          if (usages.length >= 1) {
            return usages[0]
          }
          return null
        })

      if (usageRecord) {
        // Update the usage record
        await tx
          .update(schema.usage)
          .set({
            used: sql`${schema.usage.used} + ${tokens}`,
          })
          .where(eq(schema.usage.id, usageRecord.id))
      } else {
        // Create a new usage record
        const usageId = await db
          .insert(schema.usage)
          .values({
            used: tokens,
            limit: TOKEN_USAGE_LIMITS.FREE,
            startDate: now,
            endDate: oneMonthLater,
            type: 'token',
          })
          .returning({ id: schema.usage.id })
          .then((usages) => {
            if (usages.length === 1) {
              return usages[0].id
            }
            throw new Error('Failed to create usage record')
          })

        match(userSession)
          .with(
            {
              userId: P.string,
            },
            ({ userId }) => {
              return db
                .update(schema.user)
                .set({
                  usageId,
                })
                .where(eq(schema.user.id, userId))
            }
          )
          .with(
            {
              fingerprintId: P.string,
            },
            ({ fingerprintId }) => {
              return db
                .update(schema.fingerprint)
                .set({
                  usageId,
                })
                .where(eq(schema.fingerprint.id, fingerprintId))
            }
          )
          .otherwise(() => {
            throw new Error('No user or fingerprint session found')
          })
      }
    })
  }

  async getUserUsageAndLimit(fingerprintId: string): Promise<Usage> {
    const now = new Date()
    const result = await db
      .select({
        userId: schema.user.id,
        fingerprintId: schema.fingerprint.id,
        type: schema.usage.type,
        used: sql<number>`SUM(COALESCE(${schema.usage.used}, 0))`,
        limit: sql<number>`MAX(COALESCE(${schema.usage.limit}, 0))`,
      })
      .from(schema.usage)
      .leftJoin(schema.user, eq(schema.usage.id, schema.user.usageId))
      .leftJoin(schema.fingerprint, eq(schema.usage.id, schema.fingerprint.id))
      .where(
        and(lte(schema.usage.startDate, now), gte(schema.usage.endDate, now))
      )
      .groupBy(schema.user.id, schema.fingerprint.id, schema.usage.type)
      .then((usages) => {
        if (usages.length === 0) {
          return {
            used: 0,
            limit: TOKEN_USAGE_LIMITS.ANON,
            userId: null,
            type: 'token',
          }
        }
        return usages[0]
      })

    if (result.userId) {
      return {
        used: result.used,
        limit: result.limit,
        type: result.type,
      }
    }

    return {
      used: 0,
      limit: TOKEN_USAGE_LIMITS.FREE,
      type: 'token',
    }
  }

  async withinUsageLimit(fingerprintId: string): Promise<boolean> {
    const { used, limit } = await this.getUserUsageAndLimit(fingerprintId)
    return used < limit
  }
}

export const usageTracker = new UsageTracker()
