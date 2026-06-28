/**
 * One-off: investigate the GLM referral program end-to-end. Read-only.
 *
 *   - Who is referring others (top referrers, qualified vs pending)?
 *   - Distribution of qualified referrals per referrer.
 *   - Did referrers actually RECEIVE the benefit (GLM 5.2 weekly sessions)?
 *     i.e. did they have qualified referrals AND admit glm-5.2 sessions.
 *   - Abuse / self-referral signals.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-investigate.ts
 */

import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

// Prefix match (LIKE) so a dated provider snapshot (e.g. `z-ai/glm-5.2-20260601`)
// can't silently dodge the count — admits currently store the bare id, but the
// routing layer can append a snapshot suffix to model ids. See the model-id
// suffix gotcha in docs/freebuff-abuse-detection.md.
const GLM_MODEL = 'z-ai/glm-5.2%'

async function main() {
  // ---- 1. Headline counts for the glm program -------------------------------
  const headline = await db.execute(sql`
    SELECT
      count(*)::int                                              AS total_rows,
      count(*) FILTER (WHERE status = 'completed')::int          AS completed,
      count(*) FILTER (WHERE status = 'pending')::int            AS pending,
      count(DISTINCT referrer_id)::int                           AS distinct_referrers,
      count(DISTINCT referred_id)::int                           AS distinct_referred,
      count(DISTINCT referrer_id) FILTER (WHERE qualified_at IS NOT NULL)::int
                                                                 AS referrers_with_qualified
    FROM referral
    WHERE program = 'glm'
  `)
  console.log('=== GLM program headline ===')
  console.table([...headline])

  // ---- 2. Distribution: qualified referrals per referrer --------------------
  const dist = await db.execute(sql`
    WITH per_referrer AS (
      SELECT referrer_id,
             count(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS qualified
      FROM referral
      WHERE program = 'glm'
      GROUP BY referrer_id
    )
    SELECT
      CASE
        WHEN qualified = 0 THEN '0 (none completed yet)'
        WHEN qualified = 1 THEN '1'
        WHEN qualified = 2 THEN '2'
        WHEN qualified BETWEEN 3 AND 5 THEN '3-5'
        WHEN qualified BETWEEN 6 AND 10 THEN '6-10'
        ELSE '>10 (above cap)'
      END AS qualified_bucket,
      count(*)::int AS num_referrers
    FROM per_referrer
    GROUP BY 1
    ORDER BY 1
  `)
  console.log('\n=== how many qualified GLM referrals each referrer has ===')
  console.table([...dist])

  // ---- 3. Top referrers, with whether they USED the GLM benefit -------------
  // For each referrer: qualified + pending counts, and how many glm-5.2
  // sessions they personally admitted (the actual reward they could only get
  // by having a qualified referral).
  const top = await db.execute(sql`
    WITH per_referrer AS (
      SELECT referrer_id,
             count(*)::int                                          AS total,
             count(*) FILTER (WHERE qualified_at IS NOT NULL)::int   AS qualified,
             min(created_at)                                        AS first_ref,
             max(qualified_at)                                      AS last_qualified
      FROM referral
      WHERE program = 'glm'
      GROUP BY referrer_id
    )
    SELECT
      p.referrer_id,
      u.email,
      u.referral_limit,
      p.total,
      p.qualified,
      LEAST(p.qualified, 10) AS glm_entitlement,
      (SELECT count(*)::int FROM free_session_admit a
         WHERE a.user_id = p.referrer_id AND a.model LIKE ${GLM_MODEL}) AS glm52_sessions_used,
      p.first_ref::date  AS first_referral,
      p.last_qualified::date AS last_qualified
    FROM per_referrer p
    JOIN "user" u ON u.id = p.referrer_id
    ORDER BY p.qualified DESC, p.total DESC
    LIMIT 30
  `)
  console.log('\n=== top 30 GLM referrers (by qualified referrals) ===')
  console.table([...top])

  // ---- 4. Did the benefit actually flow? ------------------------------------
  // Referrers who have >=1 qualified glm referral -> how many actually admitted
  // a glm-5.2 session.
  const benefit = await db.execute(sql`
    WITH qualified_referrers AS (
      SELECT DISTINCT referrer_id
      FROM referral
      WHERE program = 'glm' AND qualified_at IS NOT NULL
    )
    SELECT
      count(*)::int AS qualified_referrers,
      count(*) FILTER (WHERE used.n > 0)::int AS used_glm52,
      count(*) FILTER (WHERE used.n = 0)::int AS never_used_glm52,
      coalesce(sum(used.n),0)::int AS total_glm52_sessions
    FROM qualified_referrers q
    JOIN LATERAL (
      SELECT count(*)::int AS n FROM free_session_admit a
      WHERE a.user_id = q.referrer_id AND a.model LIKE ${GLM_MODEL}
    ) used ON true
  `)
  console.log('\n=== did qualified referrers actually use the GLM 5.2 benefit? ===')
  console.table([...benefit])

  // Who admits glm-5.2 sessions but has NO qualified glm referral (would mean
  // benefit leaking from another path, e.g. self-referred credit).
  const leak = await db.execute(sql`
    WITH glm_users AS (
      SELECT user_id, count(*)::int AS sessions
      FROM free_session_admit WHERE model LIKE ${GLM_MODEL}
      GROUP BY user_id
    )
    SELECT
      count(*)::int AS distinct_glm52_users,
      count(*) FILTER (WHERE score.s > 0)::int AS have_referral_score,
      count(*) FILTER (WHERE score.s = 0)::int AS zero_referral_score
    FROM glm_users g
    JOIN LATERAL (
      SELECT
        (SELECT count(*) FROM referral r
           WHERE r.referrer_id = g.user_id AND r.program='glm' AND r.qualified_at IS NOT NULL)
        + (CASE WHEN EXISTS (SELECT 1 FROM referral r2
           WHERE r2.referred_id = g.user_id AND r2.program='glm' AND r2.qualified_at IS NOT NULL)
           THEN 1 ELSE 0 END) AS s
    ) score ON true
  `)
  console.log('\n=== glm-5.2 session users vs their referral score ===')
  console.log('(score 0 = got a glm-5.2 session without any qualified glm referral path)')
  console.table([...leak])

  // ---- 5. Abuse signals -----------------------------------------------------
  // Self-referral (referrer == referred).
  const selfRef = await db.execute(sql`
    SELECT count(*)::int AS self_referrals
    FROM referral WHERE program='glm' AND referrer_id = referred_id
  `)
  console.log('\n=== self-referrals (referrer == referred) ===')
  console.table([...selfRef])

  // Referrers concentration: top referrer share of all qualified.
  const conc = await db.execute(sql`
    WITH per_referrer AS (
      SELECT referrer_id, count(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS q
      FROM referral WHERE program='glm' GROUP BY referrer_id
    )
    SELECT
      (SELECT sum(q) FROM per_referrer)::int AS total_qualified,
      (SELECT sum(q) FROM (SELECT q FROM per_referrer ORDER BY q DESC LIMIT 5) t)::int AS top5_qualified,
      (SELECT sum(q) FROM (SELECT q FROM per_referrer ORDER BY q DESC LIMIT 10) t)::int AS top10_qualified
  `)
  console.log('\n=== concentration of qualified GLM referrals ===')
  console.table([...conc])
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
