import db from 'common/src/db'
import * as schema from 'common/src/db/schema'
import type { UsageType } from 'common/src/db/schema'
import { eq, sql, and, gte, lte } from 'drizzle-orm'
import { TOKEN_USAGE_LIMITS } from 'common/src/constants'

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
        userId: schema.session.userId,
      })
      .from(schema.session)
      .leftJoin(schema.usage, eq(schema.session.usageId, schema.usage.id))
      .where(eq(schema.usage.fingerprintId, fingerprintId))
      .limit(1)
      .then((sessions) => {
        if (sessions.length === 1) {
          return sessions[0]
        }
        return null
      })

    if (userSession) {
      // Assume no record exists so create a new one and set limits to the free tier.
      await db
        .insert(schema.usage)
        .values({
          userId: userSession.userId,
          used: tokens,
          limit: TOKEN_USAGE_LIMITS.FREE,
          startDate: now,
          endDate: oneMonthLater,
          type: 'token',
        })
        // Record exists, so  update the 'used' tokens instead
        .onConflictDoUpdate({
          target: [schema.usage.userId, schema.usage.fingerprintId],
          set: {
            used: sql`${schema.usage.used} + ${tokens}`,
          },
          where: and(
            lte(schema.usage.startDate, now),
            gte(schema.usage.endDate, now)
          ),
        })
    } else {
      // Assume no record exists so create a new one and set limits to the anonymous tier.
      await db
        .insert(schema.usage)
        .values({
          fingerprintId,
          used: tokens,
          limit: TOKEN_USAGE_LIMITS.ANON,
          startDate: now,
          endDate: oneMonthLater,
          type: 'token',
        })
        // Record exists, so  update the 'used' tokens instead
        .onConflictDoUpdate({
          target: [schema.usage.fingerprintId],
          set: {
            used: sql`${schema.usage.used} + ${tokens}`,
          },
          where: and(
            lte(schema.usage.startDate, now),
            gte(schema.usage.endDate, now)
          ),
        })
    }
  }

  async getUserUsageAndLimit(fingerprintId: string): Promise<Usage> {
    const now = new Date()
    const result = await db
      .select({
        used: sql<number>`SUM(COALESCE(${schema.usage.used}, 0))`,
        limit: sql<number>`GREATEST(COALESCE(${schema.usage.limit}, 0))`,
        userId: schema.usage.userId,
        type: schema.usage.type,
      })
      .from(schema.usage)
      .leftJoin(schema.session, eq(schema.usage.userId, schema.session.userId))
      .where(
        and(
          eq(schema.usage.fingerprintId, fingerprintId),
          lte(schema.usage.startDate, now),
          gte(schema.usage.endDate, now)
        )
      )
      .groupBy(schema.usage.type)
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
