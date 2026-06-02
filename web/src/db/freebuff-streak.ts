import { getFreebuffUsageDateKey } from '@codebuff/common/util/freebuff-streak'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { desc, eq } from 'drizzle-orm'

export async function recordFreebuffUsageDay(params: {
  userId: string
  now?: Date
}): Promise<void> {
  const now = params.now ?? new Date()
  const usageDate = getFreebuffUsageDateKey(now)

  await db
    .insert(schema.freebuffDailyUsage)
    .values({
      user_id: params.userId,
      usage_date: usageDate,
      created_at: now,
    })
    .onConflictDoNothing()
}

export async function listFreebuffUsageDatesForUser(params: {
  userId: string
}): Promise<string[]> {
  const rows = await db
    .select({ usageDate: schema.freebuffDailyUsage.usage_date })
    .from(schema.freebuffDailyUsage)
    .where(eq(schema.freebuffDailyUsage.user_id, params.userId))
    .orderBy(desc(schema.freebuffDailyUsage.usage_date))

  return rows.map((row) => row.usageDate)
}
