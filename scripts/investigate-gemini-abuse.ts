/**
 * Investigate abuse of the Gemini Pro model (`google/gemini-3.1-pro-preview`)
 * over the free chat-completions endpoint.
 *
 * Why Gemini Pro specifically: it is NOT a user-selectable picker model. The
 * only legitimate path to it is the `thinker-with-files-gemini` SUBAGENT, which
 * a full-access freebuff root spawns mid-run. Crucially, subagent requests are
 * NOT subject to the CLI-required *root*-agent gate (`free_mode_cli_required`),
 * so scripting `model = gemini-3.1-pro-preview` with a subagent `agent_id` is a
 * way to pull premium Gemini Pro for free without the "You are Buffy" marker.
 *
 * The real abuse tell is structural: an account whose ENTIRE free footprint is
 * Gemini Pro and which never touches a coding model (a free premium-Gemini
 * proxy), plus ~0 agent steps or client-id fanout. NOTE: the gemini-thinker is
 * always spawned as its OWN agent_run, so "the gemini run has no root agent in
 * it" and "msgs == runs (single-shot)" hold for EVERY user, real coders
 * included — they are architecture artifacts, surfaced as informational columns
 * (noRoot%, runs) but NOT scored as abuse. See the scoring NOTE below.
 *
 * Read-only. Run against prod:
 *   infisical run --env=prod --silent -- bun scripts/investigate-gemini-abuse.ts
 *
 * Options:
 *   --hours n       Lookback window in hours. Default: 168 (7d).
 *   --limit n       Max rows to print. Default: 60.
 *   --min-msgs n    Only print users with >= n Gemini Pro msgs. Default: 1.
 *   --json          Emit JSON.
 */
import { FREEBUFF_GEMINI_PRO_MODEL_ID } from '@codebuff/common/constants/freebuff-models'
import { FREEBUFF_ROOT_AGENT_IDS } from '@codebuff/common/constants/free-agents'
import { sql } from 'drizzle-orm'

import { db } from '@codebuff/internal/db'

function intArg(flag: string, def: number): number {
  const i = process.argv.indexOf(flag)
  if (i < 0) return def
  const v = Number.parseInt(process.argv[i + 1] ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : def
}

const hours = intArg('--hours', 168)
const limit = intArg('--limit', 60)
const minMsgs = intArg('--min-msgs', 1)
const json = process.argv.includes('--json')

const num = (v: unknown): number => (v == null ? 0 : Number(v))

async function main() {
  const cutoffIso = new Date(Date.now() - hours * 3600_000).toISOString()
  const rootIds = [...FREEBUFF_ROOT_AGENT_IDS]

  // 1. Top-line: how much Gemini Pro traffic, and how is it being requested?
  const overview = await db.execute(sql`
    WITH gem AS (
      SELECT m.id, m.user_id, m.agent_id, m.client_id,
             m.client_request_id AS run_id, m.finished_at, m.repo_url, m.credits
      FROM message m
      WHERE m.finished_at >= ${cutoffIso}::timestamptz
        AND m.model LIKE ${FREEBUFF_GEMINI_PRO_MODEL_ID + '%'}
    )
    SELECT
      COUNT(*)::int                                        AS msgs,
      COUNT(DISTINCT user_id)::int                         AS users,
      COUNT(DISTINCT run_id)::int                          AS runs,
      COUNT(*) FILTER (WHERE credits = 0)::int             AS free_msgs,
      COUNT(*) FILTER (WHERE repo_url IS NOT NULL)::int    AS with_repo
    FROM gem
  `)

  const byAgent = await db.execute(sql`
    SELECT m.agent_id,
           COUNT(*)::int AS msgs,
           COUNT(DISTINCT m.user_id)::int AS users
    FROM message m
    WHERE m.finished_at >= ${cutoffIso}::timestamptz
      AND m.model LIKE ${FREEBUFF_GEMINI_PRO_MODEL_ID + '%'}
    GROUP BY m.agent_id
    ORDER BY msgs DESC
  `)

  // 2. Per-user abuse fingerprints for Gemini Pro traffic.
  const perUser = await db.execute(sql`
    WITH gem AS (
      SELECT m.id, m.user_id, m.agent_id, m.client_id,
             m.client_request_id AS run_id, m.finished_at
      FROM message m
      WHERE m.finished_at >= ${cutoffIso}::timestamptz
        AND m.model LIKE ${FREEBUFF_GEMINI_PRO_MODEL_ID + '%'}
        AND m.client_request_id IS NOT NULL
    ),
    -- which gem runs also contain a freebuff ROOT-agent message (real thinker use)
    run_has_root AS (
      SELECT DISTINCT g.run_id
      FROM gem g
      JOIN message rm ON rm.client_request_id = g.run_id
       AND rm.agent_id IN (${sql.join(rootIds.map((a) => sql`${a}`), sql`, `)})
    ),
    -- gem messages that recorded an agent_step
    gem_steps AS (
      SELECT DISTINCT s.message_id
      FROM agent_step s
      WHERE s.message_id IN (SELECT id FROM gem)
    ),
    -- the OTHER (non-gemini-pro) models this user touched in the window: a user
    -- who ONLY ever calls gemini pro is a proxy; a real coder uses coding models too
    other_models AS (
      SELECT m.user_id, COUNT(DISTINCT m.model)::int AS other_model_count
      FROM message m
      WHERE m.finished_at >= ${cutoffIso}::timestamptz
        AND m.model NOT LIKE ${FREEBUFF_GEMINI_PRO_MODEL_ID + '%'}
        AND m.user_id IN (SELECT DISTINCT user_id FROM gem)
      GROUP BY m.user_id
    ),
    per_run AS (
      SELECT g.user_id, g.run_id,
             COUNT(*)::int AS msgs,
             COUNT(DISTINCT g.client_id)::int AS client_ids
      FROM gem g
      GROUP BY g.user_id, g.run_id
    )
    SELECT
      g.user_id,
      u.email,
      u.name,
      u.banned,
      u.created_at AS user_created_at,
      COUNT(*)::int                                          AS gem_msgs,
      COUNT(DISTINCT g.run_id)::int                          AS gem_runs,
      COUNT(DISTINCT g.client_id)::int                       AS client_ids,
      COUNT(DISTINCT g.agent_id)::int                        AS gem_agent_count,
      ARRAY_AGG(DISTINCT g.agent_id ORDER BY g.agent_id)     AS gem_agents,
      COUNT(*) FILTER (WHERE gs.message_id IS NULL)::int     AS missing_step_msgs,
      COUNT(DISTINCT g.run_id) FILTER (
        WHERE g.run_id NOT IN (SELECT run_id FROM run_has_root)
      )::int                                                 AS runs_without_root,
      COALESCE(MAX(pr.client_ids), 0)::int                   AS max_clients_per_run,
      COALESCE(MAX(pr.msgs), 0)::int                          AS max_msgs_per_run,
      COALESCE(om.other_model_count, 0)::int                  AS other_model_count,
      MIN(g.finished_at)                                      AS first_at,
      MAX(g.finished_at)                                      AS last_at
    FROM gem g
    LEFT JOIN gem_steps gs ON gs.message_id = g.id
    LEFT JOIN per_run pr ON pr.user_id = g.user_id AND pr.run_id = g.run_id
    LEFT JOIN other_models om ON om.user_id = g.user_id
    LEFT JOIN "user" u ON u.id = g.user_id
    GROUP BY g.user_id, u.email, u.name, u.banned, u.created_at, om.other_model_count
    HAVING COUNT(*) >= ${minMsgs}
    ORDER BY COUNT(*) DESC
  `)

  const ov = (Array.isArray(overview) ? overview : (overview as any).rows ?? [])[0]
  const agents = Array.isArray(byAgent) ? byAgent : (byAgent as any).rows ?? []
  const users = (Array.isArray(perUser) ? perUser : (perUser as any).rows ?? []) as any[]

  // Score each user on the gemini-specific abuse fingerprint.
  const scored = users.map((r) => {
    const gemMsgs = num(r.gem_msgs)
    const gemRuns = num(r.gem_runs)
    const missRatio = gemMsgs > 0 ? num(r.missing_step_msgs) / gemMsgs : 0
    const noRootRatio = gemRuns > 0 ? num(r.runs_without_root) / gemRuns : 0
    const ageDays = r.user_created_at
      ? (Date.now() - new Date(r.user_created_at).getTime()) / 86400_000
      : null
    const flags: string[] = []
    let score = 0
    // NOTE: `noRootRatio` and `single-shot` (gemMsgs==gemRuns) are NOT abuse
    // signals here. The gemini-thinker is ALWAYS spawned as its own agent_run
    // (its own client_request_id), so for EVERY user — power coders included —
    // the gemini run never shares a run id with the root and msgs==runs. They're
    // surfaced as informational columns only and carry no score.
    if (missRatio >= 0.9) {
      flags.push(`no-steps:${Math.round(missRatio * 100)}%`)
      score += 40
    }
    // The real proxy/farm tell: the account NEVER touches a coding model — its
    // entire free footprint is premium Gemini Pro. A real coder's thinker calls
    // sit alongside many coding-model calls (othMdl ≥ 2).
    if (num(r.other_model_count) === 0) {
      flags.push('gemini-only')
      score += 50
    } else if (num(r.other_model_count) <= 1) {
      flags.push(`few-other-models:${num(r.other_model_count)}`)
      score += 15
    }
    if (num(r.max_clients_per_run) >= 10) {
      flags.push(`fanout:${num(r.max_clients_per_run)}`)
      score += 40
    }
    if (gemMsgs >= 500) {
      flags.push(`heavy:${gemMsgs}`)
      score += 15
    }
    if (ageDays != null && ageDays < 3 && gemMsgs >= 100) {
      flags.push(`new-acct:${ageDays.toFixed(1)}d`)
      score += 20
    }
    // counter-signal: clear real-coder shape — steps recorded + uses real models.
    if (missRatio < 0.3 && num(r.other_model_count) >= 2) {
      flags.push('LEGIT?')
      score -= 50
    }
    return { ...r, gemMsgs, gemRuns, missRatio, noRootRatio, ageDays, score, flags }
  })
  scored.sort((a, b) => b.score - a.score || b.gemMsgs - a.gemMsgs)

  if (json) {
    console.log(JSON.stringify({ cutoff: cutoffIso, overview: ov, byAgent: agents, users: scored }, null, 2))
    return
  }

  console.log(`\n=== Gemini Pro (${FREEBUFF_GEMINI_PRO_MODEL_ID}) — last ${hours}h ===`)
  console.log(`since ${cutoffIso}`)
  console.log(
    `msgs=${num(ov?.msgs)}  users=${num(ov?.users)}  runs=${num(ov?.runs)}  ` +
      `free(credits=0)=${num(ov?.free_msgs)}  with_repo_url=${num(ov?.with_repo)}`,
  )

  console.log(`\n--- Gemini Pro msgs by agent_id (legit = thinker-with-files-gemini) ---`)
  for (const a of agents) {
    console.log(`  ${String(a.agent_id ?? '(null)').padEnd(32)} msgs=${num(a.msgs).toString().padStart(8)}  users=${num(a.users)}`)
  }

  console.log(`\n--- Per-user (sorted by abuse score) ---`)
  console.log(
    [
      'score'.padStart(5),
      'email'.padEnd(34),
      'gemMsgs'.padStart(7),
      'runs'.padStart(6),
      'noStep%'.padStart(7),
      'noRoot%'.padStart(7),
      'maxC/run'.padStart(8),
      'othMdl'.padStart(6),
      'age'.padStart(6),
      'flags',
    ].join('  '),
  )
  console.log('-'.repeat(160))
  for (const r of scored.slice(0, limit)) {
    console.log(
      [
        String(r.score).padStart(5),
        String(r.email ?? r.user_id).slice(0, 34).padEnd(34),
        String(r.gemMsgs).padStart(7),
        String(r.gemRuns).padStart(6),
        `${Math.round(r.missRatio * 100)}%`.padStart(7),
        `${Math.round(r.noRootRatio * 100)}%`.padStart(7),
        String(num(r.max_clients_per_run)).padStart(8),
        String(num(r.other_model_count)).padStart(6),
        (r.ageDays == null ? '-' : `${r.ageDays.toFixed(0)}d`).padStart(6),
        `${r.banned ? '[BANNED] ' : ''}${r.flags.join(', ')}`,
      ].join('  '),
    )
  }
  console.log('')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
