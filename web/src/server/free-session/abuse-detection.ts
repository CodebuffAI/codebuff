/**
 * Pure bot-suspect identifier that powers the hourly bot-sweep admin endpoint.
 *
 * Mirrors the heuristics from scripts/inspect-freebuff-active.ts: queries every
 * current free_session row, joins message stats and account metadata, and
 * returns a ranked list of suspects grouped into tiers.
 *
 * This module is read-only — banning is still a human-in-the-loop decision.
 */

import { FREEBUFF_ROOT_AGENT_IDS } from '@codebuff/common/constants/free-agents'
import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'

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

  const msgStats = await db
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
    .groupBy(schema.message.user_id)
  const statsByUser = new Map(msgStats.map((m) => [m.user_id!, m]))

  // Agent diversity is a counter-signal: real users fan out across basher,
  // file-picker, code-reviewer, etc.; bot farms stay narrow on the root agent.
  // Counted across ALL agent_ids (not just root), in the same 24h window.
  const agentDiversity = await db
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
    .groupBy(schema.message.user_id)
  const diversityByUser = new Map(
    agentDiversity.map((a) => [a.user_id!, Number(a.distinctAgents24h)]),
  )

  // Largest gap of usage (in hours) within the observation window — where
  // the window is bounded by GREATEST(user.created_at, now - 24h). For each
  // user we consider three kinds of gap: window_start → first msg, gaps
  // between consecutive msgs, and last msg → now. Max of those is the
  // quiet gap.
  //
  // Clipping the window to signup matters: a 0.2d-old account can only
  // plausibly have a gap up to its age. Without the clip, LAG() on an empty
  // pre-window history would silently omit any leading-boundary gap, so a
  // fresh bot with dense activity reads as "low quiet gap" correctly — but
  // for heavy accounts that only started hitting us within the last few
  // hours, we also want to count post-activity quiet time toward the gap.
  const nowIso = now.toISOString()
  const quietGaps = await db.execute(sql`
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
  `)
  const quietGapByUser = new Map<string, number>()
  for (const row of quietGaps as unknown as Array<{
    user_id: string
    max_gap_hours: string | number | null
  }>) {
    if (row.max_gap_hours != null) {
      quietGapByUser.set(row.user_id, Number(row.max_gap_hours))
    }
  }

  // Pull the GitHub numeric user ID (providerAccountId) for every session
  // user so we can later look up actual GitHub account ages. Users who
  // signed up with another provider simply won't have a github row.
  const githubAccounts = await db
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
    )
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
