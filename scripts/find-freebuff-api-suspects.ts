/**
 * Find accounts whose recent Freebuff usage looks like an OpenAI-compatible
 * proxy over the free chat-completions API.
 *
 * Read-only. Intended production usage:
 *   infisical run --env=prod --silent -- bun scripts/find-freebuff-api-suspects.ts
 *
 * Useful options:
 *   --hours 168          Lookback window. Default: 168 (7 days).
 *   --limit 100          Max users to print. Default: 100.
 *   --min-score 50       Minimum suspicion score to print. Default: 50.
 *   --all-free-agents    Include all free-mode agents, not just root agents.
 *   --json               Emit JSON instead of tables.
 */

import {
  FREEBUFF_ROOT_AGENT_IDS,
  FREE_MODE_AGENT_MODELS,
} from '@codebuff/common/constants/free-agents'
import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

type Args = {
  hours: number
  limit: number
  minScore: number
  allFreeAgents: boolean
  json: boolean
  includeBanned: boolean
}

type SuspectRow = {
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
  total_run_steps_reported: number | string | null
  actual_agent_steps: number | string | null
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

type Suspect = {
  score: number
  flags: string[]
  userId: string
  email: string | null
  name: string | null
  banned: boolean
  userAgeDays: number | null
  messageCount: number
  runCount: number
  clientIdCount: number
  missingStepMessages: number
  missingStepRuns: number
  missingStepRatio: number
  maxMessagesPerRun: number
  maxClientIdsPerRun: number
  avgClientIdsPerRun: number
  maxRunDurationMinutes: number | null
  runningRunCount: number
  completedRunCount: number
  totalRunStepsReported: number
  actualAgentSteps: number
  modelCount: number
  agentCount: number
  firstMessageAt: string
  lastMessageAt: string
  models: string[]
  agents: string[]
  sampleRuns: NonNullable<SuspectRow['sample_runs']>
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return value
}

function parseNonNegativeInt(raw: string | undefined, flag: string): number {
  const value = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} must be a non-negative integer`)
  }
  return value
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Find likely Freebuff API/proxy abuse accounts.

Usage:
  bun scripts/find-freebuff-api-suspects.ts [options]

Options:
  --hours n             Lookback window in hours. Default: 168.
  --limit n             Max suspect rows to print. Default: 100.
  --min-score n         Minimum score to print. Default: 50.
  --all-free-agents     Include every free-mode agent ID instead of only roots.
  --include-banned      Show users who are already banned (default: hidden).
  --json                Emit JSON.
`)
    process.exit(0)
  }

  const hoursIdx = argv.indexOf('--hours')
  const limitIdx = argv.indexOf('--limit')
  const minScoreIdx = argv.indexOf('--min-score')

  return {
    hours: hoursIdx >= 0 ? parsePositiveInt(argv[hoursIdx + 1], '--hours') : 168,
    limit: limitIdx >= 0 ? parsePositiveInt(argv[limitIdx + 1], '--limit') : 100,
    minScore:
      minScoreIdx >= 0
        ? parseNonNegativeInt(argv[minScoreIdx + 1], '--min-score')
        : 50,
    allFreeAgents: argv.includes('--all-free-agents'),
    json: argv.includes('--json'),
    includeBanned: argv.includes('--include-banned'),
  }
}

function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return ''
  return value instanceof Date ? value.toISOString() : String(value)
}

function ageDays(createdAt: Date | string | null): number | null {
  if (!createdAt) return null
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  return (Date.now() - created.getTime()) / 86_400_000
}

// Scoring rationale (revised after first sweep on 2026-05-25):
// - Old version awarded points for `heavy` / `many-runs` / `long-run` on their
//   own. This produced a cluster of score=110 false positives where legit
//   power users (missStep% ~0) got flagged just for high volume.
// - New version requires a real "proxy or farm" abuse signal before any
//   supporting volume signals score. Two abuse fingerprints:
//     P (Proxy): many distinct client_ids per run + most messages have no
//                agent step. Classic OpenAI-compat proxy.
//     F (Farm):  many runs, ~1 msg/run, ~1 client/run, no agent steps. Sock
//                accounts in a coordinated batch.
// - Tenure shield: accounts >60 days old get a -30 dampener unless they hit
//   the strong proxy signal. Real long-term users shouldn't be banned by
//   pattern-matching alone.
// - Removed the standalone `reported-steps-gap` signal; the underlying
//   `total_steps` denormalization is noisy and tajerek@gmail.com exposed
//   wild outliers (152014) that didn't reflect actual abuse.
function getScore(row: SuspectRow): { score: number; flags: string[] } {
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
  const userAge = ageDays(row.user_created_at)

  let score = 0
  const flags: string[] = []

  // --- Tier A: strong abuse signals (at least one must fire to be ban-worthy) ---

  // P: Proxy fingerprint — high client-id fanout per run AND missing agent steps.
  // We require BOTH because legit multi-user apps can have high fanout with real steps.
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

  // F: Farm fingerprint — many tiny runs all missing agent steps. Distinct
  // from proxy because clientId churn is low (1/run); the abuse pattern is
  // creating runs rather than fanning out within a run.
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

  // Avg-client-ids per run (proxy variant — multiple churning runs).
  if (avgClientIdsPerRun >= 3 && messageCount >= 20 && missingStepRatio >= 0.5) {
    score += 20
    hasProxySignal = true
    flags.push(`avg-client-ids/run:${avgClientIdsPerRun.toFixed(1)}`)
  }

  const hasAbuseSignal = hasProxySignal || hasFarmSignal

  // --- Tier B: supporting signals (only score if an abuse signal already fired) ---

  if (hasAbuseSignal) {
    // Bonus for nearly-total missing steps even without high client churn —
    // catches farms with edge-case fingerprints we haven't pattern-matched.
    if (missingStepRatio >= 0.95 && messageCount >= 50) {
      score += 15
      flags.push(`no-agent-steps:${Math.round(missingStepRatio * 100)}%`)
    }

    // Long single runs — proxies often hold one socket open for hours.
    if (maxRunDurationMinutes !== null && maxRunDurationMinutes >= 180) {
      score += 15
      flags.push(`long-run:${Math.round(maxRunDurationMinutes)}m`)
    } else if (maxRunDurationMinutes !== null && maxRunDurationMinutes >= 60) {
      score += 8
      flags.push(`long-run:${Math.round(maxRunDurationMinutes)}m`)
    }

    // Volume amplifier — same fingerprint at higher volume is more damaging.
    if (messageCount >= 500) {
      score += 15
      flags.push(`heavy:${messageCount}`)
    } else if (messageCount >= 100) {
      score += 8
      flags.push(`high-volume:${messageCount}`)
    }

    // Many messages packed into a single run — typical of held-open proxy runs.
    if (maxMessagesPerRun >= 50) {
      score += 12
      flags.push(`many-messages/run:${maxMessagesPerRun}`)
    } else if (maxMessagesPerRun >= 20) {
      score += 8
      flags.push(`many-messages/run:${maxMessagesPerRun}`)
    }

    // New account doing real volume = correlated abuse signal.
    if (userAge !== null && userAge < 7 && messageCount >= 50) {
      score += 10
      flags.push(`new-account:${userAge.toFixed(1)}d`)
    }
  }

  // --- Tier C: dampeners ---

  // Tenure shield — accounts >60d old without strong proxy fanout get a
  // dampener. Real long-time users shouldn't be banned on pattern alone.
  // The strong proxy signal (>=10 c/run + >=50% missing) can override this.
  if (
    userAge !== null &&
    userAge >= 60 &&
    !(maxClientIdsPerRun >= 10 && missingStepRatio >= 0.5)
  ) {
    score -= 30
    flags.push(`tenured:${userAge.toFixed(0)}d`)
  }

  // Real-agent-step ratio — if most messages DO produce steps, dampen further.
  // This is the strongest "legit power user" signal.
  if (missingStepRatio < 0.3 && maxClientIdsPerRun < 3) {
    score -= 40
    flags.push(`real-steps:${Math.round((1 - missingStepRatio) * 100)}%`)
  }

  return { score: Math.max(0, score), flags }
}

function normalize(row: SuspectRow): Suspect {
  const { score, flags } = getScore(row)
  const messageCount = toNum(row.message_count)
  const missingStepMessages = toNum(row.missing_step_messages)
  return {
    score,
    flags,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    banned: Boolean(row.banned),
    userAgeDays: ageDays(row.user_created_at),
    messageCount,
    runCount: toNum(row.run_count),
    clientIdCount: toNum(row.client_id_count),
    missingStepMessages,
    missingStepRuns: toNum(row.missing_step_runs),
    missingStepRatio:
      messageCount > 0 ? missingStepMessages / messageCount : 0,
    maxMessagesPerRun: toNum(row.max_messages_per_run),
    maxClientIdsPerRun: toNum(row.max_client_ids_per_run),
    avgClientIdsPerRun: toNum(row.avg_client_ids_per_run),
    maxRunDurationMinutes:
      row.max_run_duration_minutes === null
        ? null
        : toNum(row.max_run_duration_minutes),
    runningRunCount: toNum(row.running_run_count),
    completedRunCount: toNum(row.completed_run_count),
    totalRunStepsReported: toNum(row.total_run_steps_reported),
    actualAgentSteps: toNum(row.actual_agent_steps),
    modelCount: toNum(row.model_count),
    agentCount: toNum(row.agent_count),
    firstMessageAt: toIso(row.first_message_at),
    lastMessageAt: toIso(row.last_message_at),
    models: row.models ?? [],
    agents: row.agents ?? [],
    sampleRuns: row.sample_runs ?? [],
  }
}

function fmt(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function printTable(suspects: Suspect[], args: Args, cutoff: Date) {
  console.log(
    `Freebuff API suspect scan since ${cutoff.toISOString()} (${args.hours}h)`,
  )
  console.log(
    `agents=${args.allFreeAgents ? 'all free-mode agents' : 'freebuff root agents only'} minScore=${args.minScore} limit=${args.limit}`,
  )
  console.log('')

  if (suspects.length === 0) {
    console.log('No accounts met the score threshold.')
    return
  }

  console.log(
    [
      'score'.padStart(5),
      'email'.padEnd(34),
      'msgs'.padStart(6),
      'runs'.padStart(5),
      'clients'.padStart(7),
      'maxC/run'.padStart(8),
      'maxM/run'.padStart(8),
      'missStep%'.padStart(9),
      'maxDur'.padStart(7),
      'flags',
    ].join('  '),
  )
  console.log('-'.repeat(150))

  for (const suspect of suspects) {
    const email = (suspect.email ?? suspect.userId).slice(0, 34)
    const maxDur =
      suspect.maxRunDurationMinutes === null
        ? '-'
        : `${Math.round(suspect.maxRunDurationMinutes)}m`
    console.log(
      [
        String(suspect.score).padStart(5),
        email.padEnd(34),
        fmt(suspect.messageCount).padStart(6),
        fmt(suspect.runCount).padStart(5),
        fmt(suspect.clientIdCount).padStart(7),
        fmt(suspect.maxClientIdsPerRun).padStart(8),
        fmt(suspect.maxMessagesPerRun).padStart(8),
        `${Math.round(suspect.missingStepRatio * 100)}%`.padStart(9),
        maxDur.padStart(7),
        suspect.flags.join(', '),
      ].join('  '),
    )
  }

  console.log('')
  for (const suspect of suspects.slice(0, 20)) {
    console.log(
      `${suspect.email ?? suspect.userId} score=${suspect.score} user=${suspect.userId}`,
    )
    console.log(
      `  messages=${suspect.messageCount} runs=${suspect.runCount} clients=${suspect.clientIdCount} agents=${suspect.agents.join(', ')}`,
    )
    console.log(
      `  models=${suspect.models.slice(0, 6).join(', ')}${suspect.models.length > 6 ? ', ...' : ''}`,
    )
    for (const run of suspect.sampleRuns.slice(0, 3)) {
      const duration =
        run.duration_minutes === null ? '-' : `${Math.round(run.duration_minutes)}m`
      console.log(
        `  run ${run.run_id}: msgs=${run.messages} clients=${run.client_ids} steps=${run.steps}/${run.total_steps ?? '-'} status=${run.status ?? '-'} duration=${duration}`,
      )
    }
  }
}

async function main() {
  const args = parseArgs()
  const cutoff = new Date(Date.now() - args.hours * 3600_000)
  const agentIds = args.allFreeAgents
    ? Object.keys(FREE_MODE_AGENT_MODELS)
    : [...FREEBUFF_ROOT_AGENT_IDS]

  const result = await db.execute(sql`
    WITH free_messages AS (
      SELECT
        m.id,
        m.user_id,
        m.agent_id,
        m.model,
        m.client_id,
        m.client_request_id AS run_id,
        m.finished_at,
        m.input_tokens,
        m.output_tokens,
        m.cost,
        m.credits
      FROM message m
      WHERE m.finished_at >= ${cutoff.toISOString()}::timestamptz
        AND m.agent_id IN (${sql.join(agentIds.map((id) => sql`${id}`), sql`, `)})
        AND m.client_request_id IS NOT NULL
        AND m.client_id IS NOT NULL
        AND m.credits = 0
    ),
    scoped_steps AS (
      SELECT s.agent_run_id, s.message_id
      FROM agent_step s
      WHERE s.agent_run_id IN (SELECT DISTINCT run_id FROM free_messages)
    ),
    steps_by_run AS (
      SELECT
        ss.agent_run_id AS run_id,
        COUNT(*)::int AS step_count,
        COUNT(ss.message_id)::int AS message_step_count
      FROM scoped_steps ss
      GROUP BY ss.agent_run_id
    ),
    steps_by_message AS (
      SELECT DISTINCT ss.message_id
      FROM scoped_steps ss
      WHERE ss.message_id IS NOT NULL
    ),
    run_rollup AS (
      SELECT
        fm.user_id,
        fm.run_id,
        COUNT(*)::int AS messages,
        COUNT(DISTINCT fm.client_id)::int AS client_ids,
        COUNT(DISTINCT fm.model)::int AS models,
        COUNT(DISTINCT fm.agent_id)::int AS agents,
        MIN(fm.finished_at) AS first_message_at,
        MAX(fm.finished_at) AS last_message_at,
        ar.status,
        ar.total_steps,
        ar.created_at AS run_created_at,
        ar.completed_at AS run_completed_at,
        COALESCE(sbr.step_count, 0)::int AS step_count,
        COALESCE(sbr.message_step_count, 0)::int AS message_step_count,
        CASE
          WHEN ar.created_at IS NULL THEN NULL
          ELSE EXTRACT(EPOCH FROM (COALESCE(ar.completed_at, NOW()) - ar.created_at)) / 60.0
        END AS duration_minutes
      FROM free_messages fm
      LEFT JOIN agent_run ar
        ON ar.id = fm.run_id
       AND ar.user_id = fm.user_id
      LEFT JOIN steps_by_run sbr
        ON sbr.run_id = fm.run_id
      GROUP BY
        fm.user_id,
        fm.run_id,
        ar.status,
        ar.total_steps,
        ar.created_at,
        ar.completed_at,
        sbr.step_count,
        sbr.message_step_count
    ),
    per_user AS (
      SELECT
        fm.user_id,
        COUNT(*)::int AS message_count,
        COUNT(DISTINCT fm.run_id)::int AS run_count,
        COUNT(DISTINCT fm.client_id)::int AS client_id_count,
        COUNT(*) FILTER (WHERE sbm.message_id IS NULL)::int AS missing_step_messages,
        COUNT(DISTINCT fm.model)::int AS model_count,
        COUNT(DISTINCT fm.agent_id)::int AS agent_count,
        MIN(fm.finished_at) AS first_message_at,
        MAX(fm.finished_at) AS last_message_at,
        ARRAY_AGG(DISTINCT fm.model ORDER BY fm.model) AS models,
        ARRAY_AGG(DISTINCT fm.agent_id ORDER BY fm.agent_id) AS agents
      FROM free_messages fm
      LEFT JOIN steps_by_message sbm ON sbm.message_id = fm.id
      GROUP BY fm.user_id
    ),
    per_user_runs AS (
      SELECT
        rr.user_id,
        MAX(rr.messages)::int AS max_messages_per_run,
        MAX(rr.client_ids)::int AS max_client_ids_per_run,
        AVG(rr.client_ids)::float AS avg_client_ids_per_run,
        MAX(rr.duration_minutes)::float AS max_run_duration_minutes,
        COUNT(*) FILTER (WHERE rr.step_count = 0)::int AS missing_step_runs,
        COUNT(*) FILTER (WHERE rr.status = 'running')::int AS running_run_count,
        COUNT(*) FILTER (WHERE rr.status = 'completed')::int AS completed_run_count,
        COALESCE(SUM(rr.total_steps), 0)::int AS total_run_steps_reported,
        COALESCE(SUM(rr.step_count), 0)::int AS actual_agent_steps
      FROM run_rollup rr
      GROUP BY rr.user_id
    ),
    ranked_runs AS (
      SELECT
        rr.*,
        ROW_NUMBER() OVER (
          PARTITION BY rr.user_id
          ORDER BY rr.client_ids DESC, rr.messages DESC
        ) AS sample_rank
      FROM run_rollup rr
    ),
    sample_runs_by_user AS (
      SELECT
        rr.user_id,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'run_id', rr.run_id,
            'messages', rr.messages,
            'client_ids', rr.client_ids,
            'steps', rr.step_count,
            'status', rr.status,
            'total_steps', rr.total_steps,
            'duration_minutes', rr.duration_minutes,
            'first_message_at', rr.first_message_at,
            'last_message_at', rr.last_message_at
          )
          ORDER BY rr.client_ids DESC, rr.messages DESC
        ) AS sample_runs
      FROM ranked_runs rr
      WHERE rr.sample_rank <= 5
      GROUP BY rr.user_id
    )
    SELECT
      pu.user_id,
      u.email,
      u.name,
      u.banned,
      u.created_at AS user_created_at,
      pu.message_count,
      pu.run_count,
      pu.client_id_count,
      pu.missing_step_messages,
      pur.missing_step_runs,
      pur.max_messages_per_run,
      pur.max_client_ids_per_run,
      pur.avg_client_ids_per_run,
      pur.max_run_duration_minutes,
      pur.running_run_count,
      pur.completed_run_count,
      pur.total_run_steps_reported,
      pur.actual_agent_steps,
      pu.model_count,
      pu.agent_count,
      pu.first_message_at,
      pu.last_message_at,
      pu.models,
      pu.agents,
      sr.sample_runs
    FROM per_user pu
    JOIN per_user_runs pur ON pur.user_id = pu.user_id
    LEFT JOIN sample_runs_by_user sr ON sr.user_id = pu.user_id
    LEFT JOIN "user" u ON u.id = pu.user_id
  `)
  const rows = (Array.isArray(result)
    ? result
    : (result as { rows?: unknown[] }).rows ?? []) as SuspectRow[]

  const suspects = rows
    .map(normalize)
    .filter((suspect) => suspect.score >= args.minScore)
    .filter((suspect) => args.includeBanned || !suspect.banned)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.maxClientIdsPerRun - a.maxClientIdsPerRun ||
        b.messageCount - a.messageCount,
    )
    .slice(0, args.limit)

  if (args.json) {
    console.log(JSON.stringify({ cutoff: cutoff.toISOString(), suspects }, null, 2))
    return
  }

  printTable(suspects, args, cutoff)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
