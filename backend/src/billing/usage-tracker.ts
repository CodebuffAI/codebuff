import db from 'common/src/db'
import * as schema from 'common/src/db/schema'
import { eq, sql, or } from 'drizzle-orm'

export interface Usage {
  tokens: number
}

export class UsageTracker {
  async addTokens(fingerprintId: string, tokens: number) {
    const fingerprint = await db.query.fingerprint.findFirst({
      where: eq(schema.fingerprint.id, fingerprintId),
      columns: { userId: true },
    })

    if (fingerprint?.userId) {
      await db
        .update(schema.user)
        .set({
          usage: sql`${schema.user.usage} + ${tokens}`,
        })
        .where(eq(schema.user.id, fingerprint.userId))
    } else {
      await db
        .update(schema.fingerprint)
        .set({
          usage: sql`${schema.fingerprint.usage} + ${tokens}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.fingerprint.id, fingerprintId))
    }
  }

  async getUserUsage(fingerprintId: string): Promise<Usage> {
    const result = await db
      .select({
        combinedUsage: sql<number>`COALESCE(${schema.user.usage}, 0) + COALESCE(${schema.fingerprint.usage}, 0)`,
      })
      .from(schema.fingerprint)
      .leftJoin(schema.user, eq(schema.fingerprint.userId, schema.user.id))
      .where(
        or(
          eq(schema.fingerprint.id, fingerprintId),
          eq(schema.user.id, fingerprintId)
        )
      )
      .limit(1)

    return { tokens: result[0]?.combinedUsage || 0 }
  }

  async withinUsageLimit(fingerprintId: string): Promise<boolean> {
    const result = await db
      .select({
        combinedUsage: sql<number>`COALESCE(${schema.user.usage}, 0) + COALESCE(${schema.fingerprint.usage}, 0)`,
        maxLimit: sql<number>`GREATEST(${schema.user.limit}, ${schema.fingerprint.limit}, 0)`,
        withinLimit: sql<boolean>`combinedUsage < maxLimit`,
      })
      .from(schema.fingerprint)
      .leftJoin(schema.user, eq(schema.fingerprint.userId, schema.user.id))
      .where(
        or(
          eq(schema.fingerprint.id, fingerprintId),
          eq(schema.user.id, fingerprintId)
        )
      )
      .limit(1)

    return result[0]?.withinLimit ?? false
  }
}

export const usageTracker = new UsageTracker()
