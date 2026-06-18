/**
 * Pure scoring + row-shape for the freebuff API/proxy abuse scanner.
 *
 * Split out from `freebuff-abuse.ts` (which imports `db`/`env`) so the scoring
 * logic can be unit-tested in isolation with no DB or env coupling. The scoring
 * is the single source of truth shared by the dashboard scan, the bot-sweep,
 * and `scripts/find-freebuff-api-suspects.ts`.
 */

/** Raw per-user aggregate row returned by the scanner SQL. */
export type ApiAbuseRawRow = {
  user_id: string
  email: string | null
  name: string | null
  banned: boolean
  user_created_at: Date | string | null
  message_count: number | string
  run_count: number | string
  client_id_count: number | string
  missing_step_messages: number | string
  missing_step_runs: number | string
  max_messages_per_run: number | string
  max_client_ids_per_run: number | string
  avg_client_ids_per_run: number | string
  max_run_duration_minutes: number | string | null
  running_run_count: number | string
  completed_run_count: number | string
  model_count: number | string
  agent_count: number | string
  first_message_at: Date | string
  last_message_at: Date | string
  models: string[] | null
  agents: string[] | null
  sample_runs: Array<{
    run_id: string
    messages: number
    client_ids: number
    steps: number
    status: string | null
    total_steps: number | null
    duration_minutes: number | null
    first_message_at: string
    last_message_at: string
  }> | null
}

export const toNum = (value: unknown): number => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const toIso = (value: Date | string | null | undefined): string => {
  if (!value) return ''
  return value instanceof Date ? value.toISOString() : String(value)
}

export const ageDaysOf = (
  createdAt: Date | string | null,
  now: Date,
): number | null => {
  if (!createdAt) return null
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  return (now.getTime() - created.getTime()) / 86_400_000
}

/**
 * Scoring — ported verbatim from scripts/find-freebuff-api-suspects.ts (revised
 * 2026-05-25). At least one Tier-A abuse fingerprint (proxy fanout or farm)
 * must fire before any supporting volume signal scores, so legit power users
 * (missStep% ~0) don't get flagged on volume alone.
 */
export function scoreApiAbuse(
  row: ApiAbuseRawRow,
  now: Date,
): { score: number; flags: string[] } {
  const messageCount = toNum(row.message_count)
  const runCount = toNum(row.run_count)
  const missingStepMessages = toNum(row.missing_step_messages)
  const missingStepRatio =
    messageCount > 0 ? missingStepMessages / messageCount : 0
  const maxMessagesPerRun = toNum(row.max_messages_per_run)
  const maxClientIdsPerRun = toNum(row.max_client_ids_per_run)
  const avgClientIdsPerRun = toNum(row.avg_client_ids_per_run)
  const avgMessagesPerRun = runCount > 0 ? messageCount / runCount : 0
  const maxRunDurationMinutes =
    row.max_run_duration_minutes === null
      ? null
      : toNum(row.max_run_duration_minutes)
  const userAge = ageDaysOf(row.user_created_at, now)

  let score = 0
  const flags: string[] = []

  // --- Tier A: strong abuse signals (at least one must fire) ---

  let hasProxySignal = false
  if (maxClientIdsPerRun >= 20 && missingStepRatio >= 0.5) {
    score += 60
    hasProxySignal = true
    flags.push(`proxy-fanout:${maxClientIdsPerRun}c/run@${Math.round(missingStepRatio * 100)}%`)
  } else if (maxClientIdsPerRun >= 10 && missingStepRatio >= 0.5) {
    score += 50
    hasProxySignal = true
    flags.push(`proxy-fanout:${maxClientIdsPerRun}c/run@${Math.round(missingStepRatio * 100)}%`)
  } else if (maxClientIdsPerRun >= 5 && missingStepRatio >= 0.5) {
    score += 35
    hasProxySignal = true
    flags.push(`proxy-fanout:${maxClientIdsPerRun}c/run@${Math.round(missingStepRatio * 100)}%`)
  } else if (maxClientIdsPerRun >= 3 && missingStepRatio >= 0.75) {
    score += 20
    hasProxySignal = true
    flags.push(`proxy-fanout:${maxClientIdsPerRun}c/run@${Math.round(missingStepRatio * 100)}%`)
  }

  let hasFarmSignal = false
  if (
    runCount >= 100 &&
    avgMessagesPerRun < 2 &&
    maxClientIdsPerRun <= 2 &&
    missingStepRatio >= 0.95
  ) {
    score += 60
    hasFarmSignal = true
    flags.push(`farm:${runCount}runs@${avgMessagesPerRun.toFixed(1)}m/r`)
  } else if (
    runCount >= 50 &&
    avgMessagesPerRun < 2 &&
    maxClientIdsPerRun <= 2 &&
    missingStepRatio >= 0.95
  ) {
    score += 40
    hasFarmSignal = true
    flags.push(`farm:${runCount}runs@${avgMessagesPerRun.toFixed(1)}m/r`)
  }

  if (avgClientIdsPerRun >= 3 && messageCount >= 20 && missingStepRatio >= 0.5) {
    score += 20
    hasProxySignal = true
    flags.push(`avg-client-ids/run:${avgClientIdsPerRun.toFixed(1)}`)
  }

  const hasAbuseSignal = hasProxySignal || hasFarmSignal

  // --- Tier B: supporting signals (only score if an abuse signal fired) ---
  if (hasAbuseSignal) {
    if (missingStepRatio >= 0.95 && messageCount >= 50) {
      score += 15
      flags.push(`no-agent-steps:${Math.round(missingStepRatio * 100)}%`)
    }
    if (maxRunDurationMinutes !== null && maxRunDurationMinutes >= 180) {
      score += 15
      flags.push(`long-run:${Math.round(maxRunDurationMinutes)}m`)
    } else if (maxRunDurationMinutes !== null && maxRunDurationMinutes >= 60) {
      score += 8
      flags.push(`long-run:${Math.round(maxRunDurationMinutes)}m`)
    }
    if (messageCount >= 500) {
      score += 15
      flags.push(`heavy:${messageCount}`)
    } else if (messageCount >= 100) {
      score += 8
      flags.push(`high-volume:${messageCount}`)
    }
    if (maxMessagesPerRun >= 50) {
      score += 12
      flags.push(`many-messages/run:${maxMessagesPerRun}`)
    } else if (maxMessagesPerRun >= 20) {
      score += 8
      flags.push(`many-messages/run:${maxMessagesPerRun}`)
    }
    if (userAge !== null && userAge < 7 && messageCount >= 50) {
      score += 10
      flags.push(`new-account:${userAge.toFixed(1)}d`)
    }
  }

  // --- Tier C: dampeners ---
  if (
    userAge !== null &&
    userAge >= 60 &&
    !(maxClientIdsPerRun >= 10 && missingStepRatio >= 0.5)
  ) {
    score -= 30
    flags.push(`tenured:${userAge.toFixed(0)}d`)
  }
  if (missingStepRatio < 0.3 && maxClientIdsPerRun < 3) {
    score -= 40
    flags.push(`real-steps:${Math.round((1 - missingStepRatio) * 100)}%`)
  }

  return { score: Math.max(0, score), flags }
}
