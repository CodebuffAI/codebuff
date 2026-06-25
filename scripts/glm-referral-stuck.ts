/**
 * One-off: diagnose why GLM referral rows are stuck `pending`. Joins each
 * pending 'glm' referral to the referred user's cached GitHub qualification
 * facts (via the github account link) and buckets them by whether the account
 * WOULD already pass the GLM 12-month age bar. A pending row whose referred
 * account is already >=12 months old is a missed-evaluation: it should have
 * completed but no live trigger re-ran and there is no sweep backstop.
 *
 * Read-only.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-stuck.ts
 */

import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

const GLM_AGE_MONTHS = 12

async function main() {
  // Bucket every pending 'glm' referral by the referred user's GitHub facts.
  //   would_qualify_now : has a github account, cached account age >= 12mo
  //   too_new           : has a github account, cached age < 12mo (legit pending)
  //   no_github_facts   : github account linked but no qualification row cached
  //   no_github_account : referred user has no github account (Google-only)
  const buckets = await db.execute(sql`
    WITH pending_glm AS (
      SELECT r.referred_id, r.created_at
      FROM referral r
      WHERE r.program = 'glm' AND r.status = 'pending'
    ),
    joined AS (
      SELECT
        p.referred_id,
        p.created_at,
        a."providerAccountId" AS github_user_id,
        q.github_account_created_at
      FROM pending_glm p
      LEFT JOIN account a
        ON a."userId" = p.referred_id AND a.provider = 'github'
      LEFT JOIN referral_qualification q
        ON q.github_user_id = a."providerAccountId"
    )
    SELECT
      CASE
        WHEN github_user_id IS NULL THEN 'no_github_account'
        WHEN github_account_created_at IS NULL THEN 'no_github_facts'
        WHEN github_account_created_at <= now() - (${GLM_AGE_MONTHS} || ' months')::interval
          THEN 'would_qualify_now'
        ELSE 'too_new'
      END AS bucket,
      count(*)::int AS n,
      round(avg(extract(epoch FROM (now() - created_at)) / 3600)::numeric, 1) AS avg_age_hours,
      round(max(extract(epoch FROM (now() - created_at)) / 3600)::numeric, 1) AS max_age_hours
    FROM joined
    GROUP BY 1
    ORDER BY n DESC
  `)
  console.log('=== pending GLM referrals, bucketed by referred-user GitHub facts ===')
  // db.execute (postgres-js driver) returns the rows directly as a RowList.
  console.table([...buckets])

  // Smoking gun: pending 'glm' rows whose referred user ALSO has a COMPLETED
  // 'web' row. Web qualified (4mo bar) so the user was definitely evaluated and
  // has a github account; if the glm row is >=12mo it should have completed too.
  const webDoneGlmPending = await db.execute(sql`
    SELECT
      CASE
        WHEN q.github_account_created_at IS NULL THEN 'no_facts'
        WHEN q.github_account_created_at <= now() - (${GLM_AGE_MONTHS} || ' months')::interval
          THEN 'would_qualify_now'
        ELSE 'too_new'
      END AS bucket,
      count(*)::int AS n
    FROM referral g
    JOIN referral w
      ON w.referred_id = g.referred_id AND w.program = 'web' AND w.status = 'completed'
    LEFT JOIN account a
      ON a."userId" = g.referred_id AND a.provider = 'github'
    LEFT JOIN referral_qualification q
      ON q.github_user_id = a."providerAccountId"
    WHERE g.program = 'glm' AND g.status = 'pending'
    GROUP BY 1
    ORDER BY n DESC
  `)
  console.log('\n=== pending GLM rows whose referred user has a COMPLETED web row ===')
  console.log('(web bar is 4mo, glm bar is 12mo — "would_qualify_now" here = should already be completed)')
  console.table([...webDoneGlmPending])

  // How long have pending glm rows been stuck? Age histogram.
  const ageHist = await db.execute(sql`
    SELECT
      CASE
        WHEN created_at > now() - interval '1 hour'  THEN '0: <1h'
        WHEN created_at > now() - interval '6 hours' THEN '1: 1-6h'
        WHEN created_at > now() - interval '1 day'   THEN '2: 6-24h'
        WHEN created_at > now() - interval '3 days'  THEN '3: 1-3d'
        WHEN created_at > now() - interval '7 days'  THEN '4: 3-7d'
        ELSE '5: >7d'
      END AS age_bucket,
      count(*)::int AS n
    FROM referral
    WHERE program = 'glm' AND status = 'pending'
    GROUP BY 1 ORDER BY 1
  `)
  console.log('\n=== age of pending GLM referrals (time since created) ===')
  console.table([...ageHist])
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
