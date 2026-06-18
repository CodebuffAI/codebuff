/**
 * Shared freebuff abuse-detection core.
 *
 * Pure-ish bot-suspect identifier plus the ban primitive. Lives in
 * `@codebuff/internal` so BOTH consumers can use it:
 *   - the codebuff.com `/api/admin/bot-sweep` endpoint (email report), and
 *   - the freebuff.com `/abuse` admin dashboard (interactive list + bans).
 *
 * Mirrors the heuristics from scripts/inspect-freebuff-active.ts: queries every
 * current free_session row, joins message stats and account metadata, and
 * returns a ranked list of suspects grouped into tiers.
 *
 * Detection is read-only; banning is a deliberate, explicit call to
 * `banSuspects` (human-in-the-loop from the dashboard).
 */

import {
  FREE_MODE_AGENT_MODELS,
  FREEBUFF_ROOT_AGENT_IDS,
} from '@codebuff/common/constants/free-agents'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from './db'
import * as schema from './db/schema'
import { env } from './env'
import {
  ageDaysOf,
  scoreApiAbuse,
  toIso,
  toNum,
} from './freebuff-abuse-scoring'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ApiAbuseRawRow } from './freebuff-abuse-scoring'

// Re-exported so consumers (scripts, tests) can reach the pure scoring without
// importing the scoring module path directly.
export { scoreApiAbuse } from './freebuff-abuse-scoring'
export type { ApiAbuseRawRow } from './freebuff-abuse-scoring'

const WINDOW_HOURS = 24
const GITHUB_API_CONCURRENCY = 8
const GITHUB_API_TIMEOUT_MS = 10_000

export type SuspectTier = 'high' | 'medium'

export type BotSuspect = {
  userId: string
  email: string
  name: string | null
  status: string
  model: string
  ageDays: number
  msgs24h: number
  distinctHours24h: number
  maxQuietGapHours24h: number | null
  distinctAgents24h: number
  msgsLifetime: number
  githubId: string | null
  githubAgeDays: number | null
  flags: string[]
  counterSignals: string[]
  tier: SuspectTier
  score: number
}

export type SweepReport = {
  generatedAt: Date
  totalSessions: number
  activeCount: number
  queuedCount: number
  suspects: BotSuspect[]
  creationClusters: CreationCluster[]
}

/**
 * Accounts created within a short window can indicate mass-signup abuse. We
 * highlight them separately so a reviewer can spot-check even accounts that
 * aren't yet heavy users.
 */
export type CreationCluster = {
  windowStart: Date
  windowEnd: Date
  emails: string[]
}

const CREATION_CLUSTER_WINDOW_MS = 30 * 60 * 1000 // 30 minutes
const CREATION_CLUSTER_MIN_SIZE = 4

export async function identifyBotSuspects(params: {
  logger: Logger
}): Promise<SweepReport> {
  const { logger } = params
  const now = new Date()
  const cutoff = new Date(now.getTime() - WINDOW_HOURS * 3600_000)
  // postgres-js can't encode a JS Date as an ad-hoc template parameter
  // (it only knows how when the driver recognises the target column's
  // type). Embed the ISO string with an explicit cast so the FILTER
  // clauses below go through cleanly.
  const cutoffIso = cutoff.toISOString()

  const sessions = await db
    .select({
      user_id: schema.freeSession.user_id,
      status: schema.freeSession.status,
      model: schema.freeSession.model,
      email: schema.user.email,
      name: schema.user.name,
      handle: schema.user.handle,
      banned: schema.user.banned,
      user_created_at: schema.user.created_at,
    })
    .from(schema.freeSession)
    .leftJoin(schema.user, eq(schema.freeSession.user_id, schema.user.id))

  if (sessions.length === 0) {
    return {
      generatedAt: now,
      totalSessions: 0,
      activeCount: 0,
      queuedCount: 0,
      suspects: [],
      creationClusters: [],
    }
  }

  const userIds = sessions.map((s) => s.user_id)
  const nowIso = now.toISOString()

  // These four per-user lookups all depend only on `userIds`, so fire them
  // concurrently rather than serially round-tripping the DB four times.
  const [msgStats, agentDiversity, quietGaps, githubAccounts] =
    await Promise.all([
      // Root-agent message stats (24h counts + lifetime) per user.
      db
        .select({
          user_id: schema.message.user_id,
          msgs24h: sql<number>`COUNT(*) FILTER (WHERE ${schema.message.finished_at} >= ${cutoffIso}::timestamptz)`,
          distinctHours24h: sql<number>`COUNT(DISTINCT EXTRACT(HOUR FROM ${schema.message.finished_at})) FILTER (WHERE ${schema.message.finished_at} >= ${cutoffIso}::timestamptz)`,
          lifetime: sql<number>`COUNT(*)`,
        })
        .from(schema.message)
        .where(
          and(
            inArray(schema.message.user_id, userIds),
            inArray(schema.message.agent_id, FREEBUFF_ROOT_AGENT_IDS),
          ),
        )
        .groupBy(schema.message.user_id),

      // Agent diversity is a counter-signal: real users fan out across basher,
      // file-picker, code-reviewer, etc.; bot farms stay narrow on the root
      // agent. Counted across ALL agent_ids (not just root), same 24h window.
      db
        .select({
          user_id: schema.message.user_id,
          distinctAgents24h: sql<number>`COUNT(DISTINCT ${schema.message.agent_id})`,
        })
        .from(schema.message)
        .where(
          and(
            inArray(schema.message.user_id, userIds),
            sql`${schema.message.finished_at} >= ${cutoffIso}::timestamptz`,
          ),
        )
        .groupBy(schema.message.user_id),

      // Largest gap of usage (in hours) within the observation window — where
      // the window is bounded by GREATEST(user.created_at, now - 24h). For
      // each user we consider three kinds of gap: window_start → first msg,
      // gaps between consecutive msgs, and last msg → now. Max is the quiet
      // gap.
      //
      // Clipping the window to signup matters: a 0.2d-old account can only
      // plausibly have a gap up to its age. Without the clip, LAG() on an
      // empty pre-window history would silently omit any leading-boundary gap,
      // so a fresh bot with dense activity reads as "low quiet gap" correctly
      // — but for heavy accounts that only started hitting us within the last
      // few hours, we also want to count post-activity quiet time toward it.
      db.execute(sql`
        WITH bounds AS (
          SELECT id AS user_id,
                 GREATEST(created_at, ${cutoffIso}::timestamptz) AS window_start
          FROM ${schema.user}
          WHERE id IN (${sql.join(
            userIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        ),
        msgs AS (
          SELECT m.user_id, m.finished_at, b.window_start
          FROM ${schema.message} m
          JOIN bounds b ON b.user_id = m.user_id
          WHERE m.finished_at >= b.window_start
            AND m.agent_id IN (${sql.join(
              FREEBUFF_ROOT_AGENT_IDS.map((a) => sql`${a}`),
              sql`, `,
            )})
        ),
        gaps AS (
          SELECT user_id,
                 finished_at,
                 COALESCE(
                   LAG(finished_at) OVER (PARTITION BY user_id ORDER BY finished_at),
                   window_start
                 ) AS prev
          FROM msgs
        )
        SELECT user_id,
               GREATEST(
                 MAX(EXTRACT(EPOCH FROM (finished_at - prev)) / 3600.0),
                 EXTRACT(EPOCH FROM (${nowIso}::timestamptz - MAX(finished_at))) / 3600.0
               ) AS max_gap_hours
        FROM gaps
        GROUP BY user_id
      `),

      // GitHub numeric user ID (providerAccountId) per user, for later account
      // age lookups. Users who signed up with another provider won't have a row.
      db
        .select({
          userId: schema.account.userId,
          providerAccountId: schema.account.providerAccountId,
        })
        .from(schema.account)
        .where(
          and(
            eq(schema.account.provider, 'github'),
            inArray(schema.account.userId, userIds),
          ),
        ),
    ])

  const statsByUser = new Map(msgStats.map((m) => [m.user_id!, m]))
  const diversityByUser = new Map(
    agentDiversity.map((a) => [a.user_id!, Number(a.distinctAgents24h)]),
  )
  const quietGapByUser = new Map<string, number>()
  for (const row of quietGaps as unknown as Array<{
    user_id: string
    max_gap_hours: string | number | null
  }>) {
    if (row.max_gap_hours != null) {
      quietGapByUser.set(row.user_id, Number(row.max_gap_hours))
    }
  }
  const githubIdByUser = new Map(
    githubAccounts.map((a) => [a.userId, a.providerAccountId]),
  )

  const suspects: BotSuspect[] = []
  let activeCount = 0
  let queuedCount = 0

  for (const s of sessions) {
    if (s.status === 'active') activeCount++
    else if (s.status === 'queued') queuedCount++

    // Rows whose user got hard-deleted will still appear in free_session due
    // to the FK cascade not having fired yet. Skip them: we can't judge
    // anything without the user record.
    if (!s.email || !s.user_created_at) continue
    if (s.banned) continue

    const ageDays =
      (now.getTime() - s.user_created_at.getTime()) / 86400_000
    const stats = statsByUser.get(s.user_id)
    const msgs24h = Number(stats?.msgs24h ?? 0)
    const distinctHours24h = Number(stats?.distinctHours24h ?? 0)
    const msgsLifetime = Number(stats?.lifetime ?? 0)
    const maxQuietGapHours24h = quietGapByUser.get(s.user_id) ?? null
    const distinctAgents24h = diversityByUser.get(s.user_id) ?? 0

    const flags: string[] = []
    const counterSignals: string[] = []
    let score = 0

    // --- Behavioral red flags (produce positive score) ---
    if (msgs24h >= 50 && distinctHours24h >= 20) {
      flags.push(`24-7-usage:${msgs24h}/${distinctHours24h}h`)
      score += 100
    }
    if (msgs24h >= 500) {
      flags.push(`very-heavy:${msgs24h}/24h`)
      score += 50
    } else if (msgs24h >= 300) {
      flags.push(`heavy:${msgs24h}/24h`)
      score += 30
    }
    if (ageDays < 1 && msgs24h >= 200) {
      flags.push(`new-acct<1d:${msgs24h}/24h`)
      score += 40
    } else if (ageDays < 7 && msgs24h >= 300) {
      flags.push(`new-acct<7d:${msgs24h}/24h`)
      score += 20
    }
    if (msgsLifetime >= 10000) {
      flags.push(`lifetime:${msgsLifetime}`)
      score += 15
    }

    // --- Region signal (corroborating, scored only when stacked with usage) ---
    // The free tier is intended for users in approved regions: English-speaking
    // (US, UK, Canada, Australia, NZ, Ireland) and western-European markets.
    // We have no IP data, so region is inferred from email provider and the
    // unicode characters in the display name. CJK indicators (Chinese/Japanese/
    // Korean Unicode in name, Chinese-provider emails, .edu.cn domains) are
    // the only signal we can detect reliably, and empirically our abuse
    // clusters are overwhelmingly from these provider pools. Diaspora users
    // from approved regions may trip this flag, so it only contributes to the
    // score when combined with heavy usage (the combination, not the region
    // alone, is what justifies the score bump).
    const hasCjkName =
      !!s.name &&
      /[一-鿿぀-ヿ가-힯]/.test(s.name)
    const hasChineseDomain =
      !!s.email &&
      /@(qq|163|126|sina|sina\.cn|foxmail|aliyun|139|yeah|tom)\.(com|cn|net)$/i.test(
        s.email,
      )
    const hasCnEduDomain = !!s.email && /\.edu\.cn$/i.test(s.email)
    const nonApprovedRegion =
      hasCjkName || hasChineseDomain || hasCnEduDomain
    if (nonApprovedRegion) {
      const reasons: string[] = []
      if (hasCjkName) reasons.push('cjk-name')
      if (hasChineseDomain) reasons.push('cn-provider')
      if (hasCnEduDomain) reasons.push('cn-edu')
      flags.push(`non-approved-region[${reasons.join(',')}]`)
      if (msgs24h >= 500) score += 40
      else if (msgs24h >= 300) score += 25
    }

    // --- Email/handle pattern flags (purely informational) ---
    // These are too noisy in isolation (many real users have digits in their
    // email, use plus-aliases for privacy, or sign up via duck.com). They're
    // surfaced to the reviewer but don't contribute to the score unless
    // combined with behavioral signals — and even then, the LLM layer is the
    // one that makes that judgment, not this scorer.
    if (s.email && /\+[a-z0-9]{6,}@/i.test(s.email)) flags.push('plus-alias')
    if (s.email && /^[a-z]{3,8}\d{4,}@/i.test(s.email)) flags.push('email-digits')
    if (s.email && /@duck\.com$/i.test(s.email)) flags.push('duck.com-alias')
    if (s.handle && /^user[-_]?\d+/i.test(s.handle)) flags.push('handle-userN')

    // --- Counter-signals (reduce score, surface alongside flags) ---
    // Quiet gap: bots don't sleep. A real developer's activity shows
    // multi-hour breaks for sleep, meals, meetings.
    if (maxQuietGapHours24h !== null) {
      if (maxQuietGapHours24h >= 8) {
        counterSignals.push(`quiet-gap:${maxQuietGapHours24h.toFixed(1)}h`)
        score -= 40
      } else if (maxQuietGapHours24h >= 4) {
        counterSignals.push(`quiet-gap:${maxQuietGapHours24h.toFixed(1)}h`)
        score -= 20
      }
    }
    // Agent diversity: real users pipeline through basher, file-picker,
    // code-reviewer, thinker alongside the root agent. Bot farms stay narrow.
    if (distinctAgents24h >= 10) {
      counterSignals.push(`diverse-agents:${distinctAgents24h}`)
      score -= 40
    } else if (distinctAgents24h >= 6) {
      counterSignals.push(`diverse-agents:${distinctAgents24h}`)
      score -= 20
    }

    // Skip users with no behavioral signals — email-pattern flags alone
    // shouldn't put a user on the review list.
    if (score <= 0 && flags.every((f) => !/^24-7|^very-heavy|^heavy|^new-acct|^lifetime/.test(f))) {
      continue
    }

    const tier: SuspectTier = score >= 80 ? 'high' : 'medium'

    suspects.push({
      userId: s.user_id,
      email: s.email,
      name: s.name,
      status: s.status,
      model: s.model,
      ageDays,
      msgs24h,
      distinctHours24h,
      maxQuietGapHours24h,
      distinctAgents24h,
      msgsLifetime,
      githubId: githubIdByUser.get(s.user_id) ?? null,
      githubAgeDays: null,
      flags,
      counterSignals,
      tier,
      score,
    })
  }

  // Fan out GitHub account lookups ONLY for the shortlist so we don't blow
  // through the rate limit for uninteresting sessions. Updates each suspect
  // in place — adds a flag if the GH account itself is young.
  await enrichWithGithubAge(suspects, now, logger)

  // Re-tier after GH age flags may have bumped scores past the threshold.
  for (const s of suspects) {
    s.tier = s.score >= 80 ? 'high' : 'medium'
  }
  suspects.sort((a, b) => b.score - a.score)

  const creationClusters = findCreationClusters(
    sessions
      .filter((s) => s.email && s.user_created_at && !s.banned)
      .map((s) => ({ email: s.email!, createdAt: s.user_created_at! })),
  )

  logger.info(
    {
      totalSessions: sessions.length,
      activeCount,
      queuedCount,
      suspectCount: suspects.length,
      highTierCount: suspects.filter((s) => s.tier === 'high').length,
      clusterCount: creationClusters.length,
    },
    'Freebuff bot-sweep scan complete',
  )

  return {
    generatedAt: now,
    totalSessions: sessions.length,
    activeCount,
    queuedCount,
    suspects,
    creationClusters,
  }
}

/**
 * Ban a set of users by id: flip `banned=true` and clear their
 * `free_session` rows so admitted slots free up immediately. Mirrors
 * scripts/ban-freebuff-bots.ts. Idempotent — re-banning an already-banned
 * user is a no-op on the user row.
 *
 * `bannedEmails` is only the users that actually flipped from unbanned (the
 * UPDATE filters on `banned = false`), so callers can report an accurate
 * count. Free sessions are cleared for ALL requested ids regardless, so
 * re-banning still frees any slot the account is holding.
 */
export async function banSuspects(params: {
  userIds: string[]
  logger: Logger
}): Promise<{ bannedEmails: string[]; freeSessionsCleared: number }> {
  const { userIds, logger } = params
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) {
    return { bannedEmails: [], freeSessionsCleared: 0 }
  }

  const banned = await db
    .update(schema.user)
    .set({ banned: true })
    .where(and(inArray(schema.user.id, ids), eq(schema.user.banned, false)))
    .returning({ email: schema.user.email })

  const deleted = await db
    .delete(schema.freeSession)
    .where(inArray(schema.freeSession.user_id, ids))
    .returning({ user_id: schema.freeSession.user_id })

  logger.info(
    { count: banned.length, freeSessionsCleared: deleted.length },
    'Freebuff abuse dashboard banned users',
  )

  return {
    bannedEmails: banned.map((b) => b.email),
    freeSessionsCleared: deleted.length,
  }
}

// ---------------------------------------------------------------------------
// API / proxy abuse scanner
//
// The session scorer above only sees accounts with a CURRENT free_session
// row and judges them on coarse behavioral heuristics (24/7 usage, volume,
// region). It misses the core abuse — reselling free premium by scripting the
// raw `/v1/chat/completions` endpoint — because those callers (a) often have
// no live session and (b) look "quiet" by message-rate.
//
// This scanner is the strong detector, ported from
// scripts/find-freebuff-api-suspects.ts. It works at the REQUEST level over a
// lookback window and keys on two bypass-proof fingerprints:
//   - Proxy fanout: many distinct client_ids inside one held-open run, with
//     most messages producing NO agent_step (`missingStepRatio`).
//   - Farm: many tiny one-message runs, ~0 agent steps (coordinated socks).
// See the scoring comment on `scoreApiAbuse` for the full rationale.
// ---------------------------------------------------------------------------

export type ApiAbuseSampleRun = {
  runId: string
  messages: number
  clientIds: number
  steps: number
  status: string | null
  totalSteps: number | null
  durationMinutes: number | null
  firstMessageAt: string
  lastMessageAt: string
}

export type ApiAbuseSuspect = {
  userId: string
  email: string | null
  name: string | null
  banned: boolean
  userAgeDays: number | null
  score: number
  flags: string[]
  messageCount: number
  runCount: number
  clientIdCount: number
  missingStepMessages: number
  missingStepRatio: number
  maxMessagesPerRun: number
  maxClientIdsPerRun: number
  avgClientIdsPerRun: number
  maxRunDurationMinutes: number | null
  runningRunCount: number
  completedRunCount: number
  modelCount: number
  agentCount: number
  firstMessageAt: string
  lastMessageAt: string
  models: string[]
  agents: string[]
  sampleRuns: ApiAbuseSampleRun[]
}

export type ApiAbuseReport = {
  generatedAt: Date
  lookbackHours: number
  minScore: number
  totalScanned: number
  suspects: ApiAbuseSuspect[]
}

/**
 * Scan free-mode request traffic over a lookback window for proxy/farm abuse.
 * Returns scored suspects with per-run sample detail for inline inspection.
 * Read-only.
 */
export async function identifyApiAbuseSuspects(params: {
  logger: Logger
  hours?: number
  minScore?: number
  limit?: number
  includeBanned?: boolean
  /** Scan every free-mode agent, not just the freebuff root agents. */
  allFreeAgents?: boolean
}): Promise<ApiAbuseReport> {
  const {
    logger,
    hours = 168,
    minScore = 30,
    limit = 200,
    includeBanned = false,
    allFreeAgents = false,
  } = params
  const now = new Date()
  const cutoffIso = new Date(now.getTime() - hours * 3600_000).toISOString()
  const agentIds = allFreeAgents
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
        m.finished_at
      FROM message m
      WHERE m.finished_at >= ${cutoffIso}::timestamptz
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
        MIN(fm.finished_at) AS first_message_at,
        MAX(fm.finished_at) AS last_message_at,
        ar.status,
        ar.total_steps,
        ar.created_at AS run_created_at,
        ar.completed_at AS run_completed_at,
        COALESCE(sbr.step_count, 0)::int AS step_count,
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
        fm.user_id, fm.run_id, ar.status, ar.total_steps,
        ar.created_at, ar.completed_at, sbr.step_count
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
        COUNT(*) FILTER (WHERE rr.status = 'completed')::int AS completed_run_count
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

  const rows = (
    Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []
  ) as ApiAbuseRawRow[]

  const suspects: ApiAbuseSuspect[] = rows
    .map((row): ApiAbuseSuspect => {
      const { score, flags } = scoreApiAbuse(row, now)
      const messageCount = toNum(row.message_count)
      const missingStepMessages = toNum(row.missing_step_messages)
      return {
        userId: row.user_id,
        email: row.email,
        name: row.name,
        banned: Boolean(row.banned),
        userAgeDays: ageDaysOf(row.user_created_at, now),
        score,
        flags,
        messageCount,
        runCount: toNum(row.run_count),
        clientIdCount: toNum(row.client_id_count),
        missingStepMessages,
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
        modelCount: toNum(row.model_count),
        agentCount: toNum(row.agent_count),
        firstMessageAt: toIso(row.first_message_at),
        lastMessageAt: toIso(row.last_message_at),
        models: row.models ?? [],
        agents: row.agents ?? [],
        sampleRuns: (row.sample_runs ?? []).map((r) => ({
          runId: r.run_id,
          messages: toNum(r.messages),
          clientIds: toNum(r.client_ids),
          steps: toNum(r.steps),
          status: r.status,
          totalSteps: r.total_steps,
          durationMinutes:
            r.duration_minutes === null ? null : toNum(r.duration_minutes),
          firstMessageAt: toIso(r.first_message_at),
          lastMessageAt: toIso(r.last_message_at),
        })),
      }
    })
    .filter((s) => s.score >= minScore)
    .filter((s) => includeBanned || !s.banned)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.maxClientIdsPerRun - a.maxClientIdsPerRun ||
        b.messageCount - a.messageCount,
    )
    .slice(0, limit)

  logger.info(
    {
      lookbackHours: hours,
      minScore,
      totalScanned: rows.length,
      suspectCount: suspects.length,
    },
    'Freebuff API-abuse scan complete',
  )

  return {
    generatedAt: now,
    lookbackHours: hours,
    minScore,
    totalScanned: rows.length,
    suspects,
  }
}

async function enrichWithGithubAge(
  suspects: BotSuspect[],
  now: Date,
  logger: Logger,
): Promise<void> {
  const targets = suspects.filter((s) => s.githubId)
  if (targets.length === 0) return

  const queue = [...targets]
  let failures = 0
  let rateLimited = 0

  const worker = async () => {
    while (queue.length > 0) {
      const s = queue.shift()
      if (!s?.githubId) continue
      const result = await fetchGithubCreatedAt(s.githubId)
      if (result === 'rate-limited') {
        rateLimited++
        continue
      }
      if (result === null) {
        failures++
        continue
      }
      const ageDays = (now.getTime() - result.getTime()) / 86400_000
      s.githubAgeDays = ageDays
      if (ageDays < 7) {
        s.flags.push(`gh-new<7d:${ageDays.toFixed(1)}d`)
        s.score += 60
      } else if (ageDays < 30) {
        s.flags.push(`gh-new<30d:${ageDays.toFixed(0)}d`)
        s.score += 30
      } else if (ageDays < 90) {
        s.flags.push(`gh-new<90d:${ageDays.toFixed(0)}d`)
        s.score += 10
      } else if (ageDays >= 365 * 3) {
        // Established GitHub accounts are a strong counter-signal: buying
        // a 3+ year old account is rare at our abuse scale. Subtract enough
        // to pull a day-1 heavy user (new-acct<1d + very-heavy = 90) back
        // below the high-tier threshold without fully clearing them —
        // genuine 24/7 patterns still surface.
        s.counterSignals.push(`gh-established:${(ageDays / 365).toFixed(1)}y`)
        s.score -= 40
      } else if (ageDays >= 365) {
        s.counterSignals.push(`gh-established:${(ageDays / 365).toFixed(1)}y`)
        s.score -= 20
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(GITHUB_API_CONCURRENCY, targets.length) }, () =>
      worker(),
    ),
  )

  if (failures > 0 || rateLimited > 0) {
    logger.warn(
      { failures, rateLimited, total: targets.length },
      'GitHub age enrichment had lookup failures',
    )
  }
}

/**
 * Look up a GitHub user by numeric ID and return their `created_at`.
 * Returns `'rate-limited'` so callers can log it distinctly from other
 * failures (most likely cause at our scale). Any non-2xx is mapped to
 * `null` so one flaky user doesn't stall the sweep.
 */
async function fetchGithubCreatedAt(
  githubId: string,
): Promise<Date | 'rate-limited' | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'codebuff-bot-sweep',
    }
    if (env.BOT_SWEEP_GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${env.BOT_SWEEP_GITHUB_TOKEN}`
    }
    const res = await fetch(`https://api.github.com/user/${githubId}`, {
      headers,
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    })
    if (res.status === 403 || res.status === 429) return 'rate-limited'
    if (!res.ok) return null
    const data = (await res.json()) as { created_at?: string }
    return data.created_at ? new Date(data.created_at) : null
  } catch {
    return null
  }
}

function findCreationClusters(
  rows: { email: string; createdAt: Date }[],
): CreationCluster[] {
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
  // Greedy non-overlapping sweep: walk the sorted list, and whenever the next
  // account is within the window of the current cluster's first member, add
  // it. Emit clusters that reach the minimum size.
  const clusters: CreationCluster[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (
      j < sorted.length &&
      sorted[j].createdAt.getTime() - sorted[i].createdAt.getTime() <=
        CREATION_CLUSTER_WINDOW_MS
    ) {
      j++
    }
    if (j - i >= CREATION_CLUSTER_MIN_SIZE) {
      clusters.push({
        windowStart: sorted[i].createdAt,
        windowEnd: sorted[j - 1].createdAt,
        emails: sorted.slice(i, j).map((m) => m.email),
      })
      i = j
    } else {
      i++
    }
  }
  return clusters
}

export function formatSweepReport(report: SweepReport): {
  subject: string
  message: string
} {
  const high = report.suspects.filter((s) => s.tier === 'high')
  const medium = report.suspects.filter((s) => s.tier === 'medium')

  const subject =
    high.length > 0
      ? `[freebuff bot-sweep] ${high.length} high-confidence suspects (${report.totalSessions} active+queued)`
      : `[freebuff bot-sweep] ${medium.length} medium suspects (${report.totalSessions} active+queued)`

  const lines: string[] = []
  lines.push(`Snapshot: ${report.generatedAt.toISOString()}`)
  lines.push(
    `Sessions: ${report.totalSessions} (active=${report.activeCount}, queued=${report.queuedCount})`,
  )
  lines.push(`Suspects: high=${high.length}, medium=${medium.length}`)
  lines.push('')

  // Hyphen-separated rather than column-aligned: Loops may render
  // {{message}} as HTML and collapse whitespace, which would ruin padEnd
  // column alignment. Separator-delimited survives both plain text and
  // wrapped HTML.
  const renderSuspect = (s: BotSuspect) => {
    const gh =
      s.githubAgeDays !== null
        ? ` gh_age=${s.githubAgeDays.toFixed(1)}d`
        : s.githubId === null
          ? ' gh_age=n/a'
          : ' gh_age=?'
    const counter =
      s.counterSignals.length > 0
        ? ` | counter: ${s.counterSignals.join(' ')}`
        : ''
    return `  ${s.email} — score=${s.score} age=${s.ageDays.toFixed(1)}d${gh} msgs24=${s.msgs24h} agents24=${s.distinctAgents24h} lifetime=${s.msgsLifetime} | ${s.flags.join(' ')}${counter}`
  }

  if (high.length > 0) {
    lines.push(`=== HIGH CONFIDENCE (${high.length}) ===`)
    for (const s of high) lines.push(renderSuspect(s))
    lines.push('')
  }

  if (medium.length > 0) {
    lines.push(`=== MEDIUM (${medium.length}) ===`)
    for (const s of medium) lines.push(renderSuspect(s))
    lines.push('')
  }

  if (report.creationClusters.length > 0) {
    lines.push(
      `=== CREATION CLUSTERS (${report.creationClusters.length}) — accounts created within ${CREATION_CLUSTER_WINDOW_MS / 60000}m of each other ===`,
    )
    for (const c of report.creationClusters) {
      lines.push(
        `  ${c.windowStart.toISOString()} .. ${c.windowEnd.toISOString()}  n=${c.emails.length}`,
      )
      for (const e of c.emails) lines.push(`    ${e}`)
    }
    lines.push('')
  }

  lines.push('DRY RUN — this report does not ban anyone.')
  lines.push(
    'To ban: edit .context/freebuff-ban-candidates.txt, then run ' +
      '`infisical run --env=prod -- bun scripts/ban-freebuff-bots.ts <path> --commit`',
  )

  return { subject, message: lines.join('\n') }
}
