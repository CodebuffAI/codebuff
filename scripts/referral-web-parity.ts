/**
 * Phase 4a parity check: is the runtime `max(legacyWebScore, newCount)` in
 * getWebReferralScore (PR #392) actually doing anything in prod?
 *
 * For every referrer that appears in either system, compute:
 *   legacyWebScore = COUNT(referral where referrer, program='web', qualified)
 *                    + (was-themselves-web-referred ? 1 : 0)        // the +1 bump
 *   newCount       = fullQualified + limitedQualified from referral_v2
 *                    (activated, not revoked, github age >= 4mo)
 *
 * If legacyWebScore <= newCount for everyone, the max() is dead weight and web
 * reads can switch to pure referral_v2. Any rows where legacy > new are exactly
 * the referrers a clean cutover would regress.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/referral-web-parity.ts
 */
import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

async function main() {
  const rows = (await db.execute(sql`
    WITH referrers AS (
      SELECT referrer_id AS uid FROM referral WHERE program = 'web'
      UNION
      SELECT referrer_id AS uid FROM referral_v2
    ),
    legacy AS (
      SELECT
        u.uid,
        (SELECT COUNT(*)::int FROM referral r
           WHERE r.referrer_id = u.uid AND r.program = 'web'
             AND r.qualified_at IS NOT NULL)
        + (CASE WHEN EXISTS (
             SELECT 1 FROM referral r2
              WHERE r2.referred_id = u.uid AND r2.program = 'web'
                AND r2.qualified_at IS NOT NULL) THEN 1 ELSE 0 END)
          AS legacy_score
      FROM referrers u
    ),
    nu AS (
      SELECT
        u.uid,
        COUNT(*) FILTER (
          WHERE r.activated_at IS NOT NULL AND r.revoked_at IS NULL
            AND q.github_account_created_at <= now() - interval '4 months'
        )::int AS new_count
      FROM referrers u
      LEFT JOIN referral_v2 r ON r.referrer_id = u.uid
      LEFT JOIN referral_qualification q
        ON q.github_user_id = r.referred_github_user_id
      GROUP BY u.uid
    )
    SELECT l.uid,
           l.legacy_score,
           COALESCE(n.new_count, 0) AS new_count,
           l.legacy_score - COALESCE(n.new_count, 0) AS gap
    FROM legacy l
    LEFT JOIN nu n ON n.uid = l.uid
    ORDER BY gap DESC
  `)) as unknown as Array<{
    uid: string
    legacy_score: number
    new_count: number
    gap: number
  }>

  const total = rows.length
  const binding = rows.filter((r) => Number(r.gap) > 0)
  const maxGap = binding.length ? Number(binding[0].gap) : 0
  const sumGap = binding.reduce((s, r) => s + Number(r.gap), 0)

  console.log(`referrers examined:        ${total}`)
  console.log(`max() is binding (legacy>new): ${binding.length}`)
  console.log(`  largest single gap:      ${maxGap}`)
  console.log(`  total tier-points at risk: ${sumGap}`)
  console.log('')
  if (binding.length) {
    console.log('top divergences (legacy would be dropped on a clean cutover):')
    for (const r of binding.slice(0, 25)) {
      console.log(
        `  ${r.uid}  legacy=${r.legacy_score}  new=${r.new_count}  gap=${r.gap}`,
      )
    }
  } else {
    console.log('No referrer regresses — the runtime max() is dead weight for web.')
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
