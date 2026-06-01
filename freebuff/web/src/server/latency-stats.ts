import { SUPPORTED_FREEBUFF_MODELS } from '@codebuff/common/constants/freebuff-models'
import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, gte, inArray, isNotNull, sql } from 'drizzle-orm'

export interface FreebuffLatencyHourlyPoint {
  hour: string
  sampleCount: number
  p50TtftMs: number | null
}

export interface FreebuffLatencyModelStats {
  modelId: string
  displayName: string
  sampleCount: number
  p50TtftMs: number
  p95TtftMs: number
  hourly: FreebuffLatencyHourlyPoint[]
}

export interface FreebuffLatencyOverallStats {
  sampleCount: number
  p50TtftMs: number
  p95TtftMs: number
}

export interface FreebuffLatencyStats {
  windowHours: number
  generatedAt: string
  totalSamples: number
  modelCount: number
  overall: FreebuffLatencyOverallStats | null
  models: FreebuffLatencyModelStats[]
}

type SummaryRow = {
  modelId: string
  sampleCount: number
  p50TtftMs: number
  p95TtftMs: number
}

type HourlyRow = {
  bucket: Date
  modelId: string
  sampleCount: number
  p50TtftMs: number
}

type OverallRow = FreebuffLatencyOverallStats

const WINDOW_HOURS = 24
const LATENCY_STATS_CACHE_MS = 60_000
const MODEL_LABELS = Object.fromEntries(
  SUPPORTED_FREEBUFF_MODELS.map(
    (model) => [model.id, model.displayName] as const,
  ),
)
const FREEBUFF_MODEL_IDS = SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)

let cachedLatencyStats: {
  expiresAt: number
  stats: FreebuffLatencyStats
} | null = null

function modelDisplayName(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId.split('/').at(-1) ?? modelId
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function buildHours(now: Date): string[] {
  const lastHour = new Date(now)
  lastHour.setMinutes(0, 0, 0)

  return Array.from({ length: WINDOW_HOURS }, (_, index) => {
    const hour = new Date(lastHour)
    hour.setHours(lastHour.getHours() - (WINDOW_HOURS - 1 - index))
    return hour.toISOString()
  })
}

function emptyHourlyPoint(hour: string): FreebuffLatencyHourlyPoint {
  return {
    hour,
    sampleCount: 0,
    p50TtftMs: null,
  }
}

function normalizeOverall(row: OverallRow | undefined) {
  if (!row || toNumber(row.sampleCount) === 0) return null

  return {
    sampleCount: toNumber(row.sampleCount),
    p50TtftMs: toNumber(row.p50TtftMs),
    p95TtftMs: toNumber(row.p95TtftMs),
  }
}

export async function getFreebuffLatencyStats(
  now?: Date,
  options: { cache?: boolean } = {},
): Promise<FreebuffLatencyStats> {
  const useCache = options.cache ?? now === undefined
  const requestTime = now ?? new Date()

  if (
    useCache &&
    cachedLatencyStats &&
    cachedLatencyStats.expiresAt > Date.now()
  ) {
    return cachedLatencyStats.stats
  }

  const windowStart = new Date(
    requestTime.getTime() - WINDOW_HOURS * 60 * 60 * 1000,
  )
  const hourBucket = sql<Date>`date_trunc('hour', ${schema.message.finished_at})`
  const recentFreebuffMessages = and(
    gte(schema.message.finished_at, windowStart),
    isNotNull(schema.message.ttft_ms),
    inArray(schema.message.model, FREEBUFF_MODEL_IDS),
    sql`${schema.message.ttft_ms} >= 0`,
  )

  const [summaryRows, hourlyRows, overallRows] = await Promise.all([
    db
      .select({
        modelId: schema.message.model,
        sampleCount: sql<number>`COUNT(*)::int`,
        p50TtftMs: sql<number>`ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${schema.message.ttft_ms}))::int`,
        p95TtftMs: sql<number>`ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${schema.message.ttft_ms}))::int`,
      })
      .from(schema.message)
      .where(recentFreebuffMessages)
      .groupBy(schema.message.model),
    db
      .select({
        bucket: hourBucket,
        modelId: schema.message.model,
        sampleCount: sql<number>`COUNT(*)::int`,
        p50TtftMs: sql<number>`ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${schema.message.ttft_ms}))::int`,
      })
      .from(schema.message)
      .where(recentFreebuffMessages)
      .groupBy(hourBucket, schema.message.model),
    db
      .select({
        sampleCount: sql<number>`COUNT(*)::int`,
        p50TtftMs: sql<number>`COALESCE(ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${schema.message.ttft_ms}))::int, 0)`,
        p95TtftMs: sql<number>`COALESCE(ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${schema.message.ttft_ms}))::int, 0)`,
      })
      .from(schema.message)
      .where(recentFreebuffMessages),
  ])

  const hours = buildHours(requestTime)
  const hourlyByModel = new Map<
    string,
    Map<string, FreebuffLatencyHourlyPoint>
  >()

  for (const row of hourlyRows as HourlyRow[]) {
    const hour = toDate(row.bucket).toISOString()
    const modelHours =
      hourlyByModel.get(row.modelId) ??
      new Map<string, FreebuffLatencyHourlyPoint>()

    modelHours.set(hour, {
      hour,
      sampleCount: toNumber(row.sampleCount),
      p50TtftMs: toNumber(row.p50TtftMs),
    })
    hourlyByModel.set(row.modelId, modelHours)
  }

  const models = (summaryRows as SummaryRow[])
    .map((row) => {
      const modelHours = hourlyByModel.get(row.modelId)
      return {
        modelId: row.modelId,
        displayName: modelDisplayName(row.modelId),
        sampleCount: toNumber(row.sampleCount),
        p50TtftMs: toNumber(row.p50TtftMs),
        p95TtftMs: toNumber(row.p95TtftMs),
        hourly: hours.map(
          (hour) => modelHours?.get(hour) ?? emptyHourlyPoint(hour),
        ),
      }
    })
    .sort((a, b) => a.p50TtftMs - b.p50TtftMs)

  const overall = normalizeOverall((overallRows as OverallRow[])[0])
  const stats: FreebuffLatencyStats = {
    windowHours: WINDOW_HOURS,
    generatedAt: requestTime.toISOString(),
    totalSamples: overall?.sampleCount ?? 0,
    modelCount: models.length,
    overall,
    models,
  }

  if (useCache) {
    cachedLatencyStats = {
      expiresAt: Date.now() + LATENCY_STATS_CACHE_MS,
      stats,
    }
  }

  return stats
}
