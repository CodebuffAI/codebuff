/**
 * One-off: detect GLM referral farming. Read-only.
 *
 * A "farm" referrer redeems many referral codes against aged/purchased GitHub
 * accounts that pass the 12-month age bar but are otherwise dormant and never
 * use the product. We score each referrer with >= MIN_QUALIFIED qualified glm
 * referrals across several independent signals:
 *
 *   - burst velocity   : referrals registered within a tiny time span
 *   - dead referreds    : referred friends who never ran the agent (no agent_run)
 *   - dormant accounts  : referred GitHub accounts with 0 public repos & 0 followers
 *   - referrer inactive : the referrer themselves never ran the agent
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-farms.ts
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-farms.ts --min 3
 */

import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

const minArgIdx = process.argv.indexOf('--min')
const MIN_QUALIFIED = minArgIdx >= 0 ? Number(process.argv[minArgIdx + 1]) : 3

async function main() {
  const rows = await db.execute(sql`
    WITH glm AS (
      SELECT referrer_id, referred_id, created_at, qualified_at
      FROM referral
      WHERE program = 'glm'
    ),
    -- github facts for each referred user (via the github account link)
    referred_facts AS (
      SELECT
        g.referrer_id,
        g.referred_id,
        g.created_at,
        g.qualified_at,
        q.github_followers,
        q.github_public_repos,
        q.github_account_created_at,
        (SELECT count(*) FROM agent_run ar WHERE ar.user_id = g.referred_id) AS referred_runs
      FROM glm g
      LEFT JOIN account a
        ON a."userId" = g.referred_id AND a.provider = 'github'
      LEFT JOIN referral_qualification q
        ON q.github_user_id = a."providerAccountId"
    ),
    per_referrer AS (
      SELECT
        referrer_id,
        count(*)::int                                              AS total,
        count(*) FILTER (WHERE qualified_at IS NOT NULL)::int      AS qualified,
        EXTRACT(EPOCH FROM (max(created_at) - min(created_at)))/3600.0 AS span_hours,
        count(*) FILTER (WHERE qualified_at IS NOT NULL AND referred_runs = 0)::int AS qual_dead,
        count(*) FILTER (WHERE qualified_at IS NOT NULL
                          AND coalesce(github_public_repos,0) = 0
                          AND coalesce(github_followers,0) = 0)::int AS qual_dormant,
        round(avg(github_followers) FILTER (WHERE qualified_at IS NOT NULL)::numeric, 1) AS avg_followers,
        round(avg(github_public_repos) FILTER (WHERE qualified_at IS NOT NULL)::numeric, 1) AS avg_repos
      FROM referred_facts
      GROUP BY referrer_id
    )
    SELECT
      p.referrer_id,
      u.email,
      p.total,
      p.qualified,
      round(p.span_hours::numeric, 2)                              AS span_h,
      round((p.qualified / NULLIF(p.span_hours,0))::numeric, 1)    AS qual_per_hour,
      p.qual_dead,
      p.qual_dormant,
      p.avg_followers,
      p.avg_repos,
      (SELECT count(*) FROM agent_run ar WHERE ar.user_id = p.referrer_id) AS referrer_runs,
      u.created_at::date                                          AS referrer_joined
    FROM per_referrer p
    JOIN \"user\" u ON u.id = p.referrer_id
    WHERE p.qualified >= ${MIN_QUALIFIED}
    ORDER BY p.qualified DESC
  `)

  // Score each referrer. Higher = more farm-like.
  const scored = [...rows].map((r: any) => {
    const qualified = Number(r.qualified)
    const qualDead = Number(r.qual_dead)
    const qualDormant = Number(r.qual_dormant)
    const span = Number(r.span_h)
    const referrerRuns = Number(r.referrer_runs)
    const deadPct = qualified ? qualDead / qualified : 0
    const dormantPct = qualified ? qualDormant / qualified : 0

    let score = 0
    const flags: string[] = []
    // burst: many qualified in < 2h
    if (span < 2 && qualified >= 4) { score += 3; flags.push('burst') }
    else if (span < 12 && qualified >= 6) { score += 1; flags.push('fast') }
    // most referred friends never used the product
    if (deadPct >= 0.8) { score += 3; flags.push('dead-referreds') }
    else if (deadPct >= 0.5) { score += 1 }
    // referred accounts are dormant aged accounts
    if (dormantPct >= 0.5) { score += 2; flags.push('dormant-accts') }
    // referrer doesn't use the product themselves
    if (referrerRuns === 0) { score += 2; flags.push('referrer-inactive') }
    // big haul
    if (qualified >= 10) { score += 1; flags.push('at/over-cap') }

    return {
      email: r.email,
      qualified,
      total: Number(r.total),
      span_h: span,
      qual_per_h: r.qual_per_hour,
      dead: qualDead,
      dormant: qualDormant,
      avg_foll: r.avg_followers,
      avg_repos: r.avg_repos,
      ref_runs: referrerRuns,
      score,
      flags: flags.join(','),
    }
  })

  scored.sort((a, b) => b.score - a.score || b.qualified - a.qualified)

  console.log(`=== GLM referrers with >= ${MIN_QUALIFIED} qualified, farm-scored ===`)
  console.log('(dead = qualified referreds who never ran the agent; dormant = referred GitHub accts w/ 0 repos & 0 followers)')
  console.table(scored)

  const farms = scored.filter((s) => s.score >= 5)
  const sumQ = farms.reduce((a, s) => a + s.qualified, 0)
  const allQ = scored.reduce((a, s) => a + s.qualified, 0)
  console.log(`\n=== summary ===`)
  console.log(`referrers analyzed (>=${MIN_QUALIFIED} qualified): ${scored.length}`)
  console.log(`suspected farms (score >= 5): ${farms.length}, holding ${sumQ} qualified referrals`)
  console.log(`(of ${allQ} qualified referrals among analyzed referrers)`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
