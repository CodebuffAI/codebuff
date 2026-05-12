import { SUPPORTED_FREEBUFF_MODELS } from '@codebuff/common/constants/freebuff-models'
import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, count, eq, gt, sql } from 'drizzle-orm'

export interface FreebuffLiveCountryCount {
  countryCode: string
  count: number
}

export interface FreebuffLiveModelCount {
  modelId: string
  displayName: string
  count: number
}

export interface FreebuffLiveStats {
  totalLiveUsers: number
  countries: FreebuffLiveCountryCount[]
  models: FreebuffLiveModelCount[]
  generatedAt: string
}

const MODEL_LABELS = Object.fromEntries(
  SUPPORTED_FREEBUFF_MODELS.map(
    (model) => [model.id, model.displayName] as const,
  ),
)

function modelDisplayName(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId.split('/').at(-1) ?? modelId
}

function liveSessionWhere(now: Date) {
  return and(
    eq(schema.freeSession.status, 'active'),
    gt(schema.freeSession.expires_at, now),
    sql`NOT EXISTS (
      SELECT 1 FROM ${schema.user}
      WHERE ${schema.user.id} = ${schema.freeSession.user_id}
        AND ${schema.user.banned} = true
    )`,
  )
}

function sortCounts<T extends { count: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.count - a.count)
}

export async function getFreebuffLiveStats(
  now = new Date(),
): Promise<FreebuffLiveStats> {
  const [countryRows, modelRows] = await Promise.all([
    db
      .select({
        countryCode: schema.freeSession.country_code,
        count: count(),
      })
      .from(schema.freeSession)
      .where(liveSessionWhere(now))
      .groupBy(schema.freeSession.country_code),
    db
      .select({
        modelId: schema.freeSession.model,
        count: count(),
      })
      .from(schema.freeSession)
      .where(liveSessionWhere(now))
      .groupBy(schema.freeSession.model),
  ])

  const countries = sortCounts(
    countryRows.map((row) => ({
      countryCode: row.countryCode ?? 'UNKNOWN',
      count: Number(row.count),
    })),
  )

  const models = sortCounts(
    modelRows.map((row) => ({
      modelId: row.modelId,
      displayName: modelDisplayName(row.modelId),
      count: Number(row.count),
    })),
  )

  return {
    totalLiveUsers: models.reduce((sum, row) => sum + row.count, 0),
    countries,
    models,
    generatedAt: now.toISOString(),
  }
}
