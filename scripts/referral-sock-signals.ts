/**
 * Sock-puppet sweep over referral_v2's attribution evidence. Read-only.
 *
 * Three detections, strongest first:
 *
 *   1. referrer overlap (live) — the referral row's referred_ip_hash /
 *      referred_device_id matches an IP (free_mode_country_access_cache) or
 *      browser (user_device) the REFERRER has been seen on. Re-derived here
 *      rather than trusting the attribution-time flags, so evidence that
 *      arrived AFTER attribution (the referrer touching an authed hop later)
 *      still surfaces.
 *   2. attribution-time flags — referrer_ip_overlap / referrer_device_overlap
 *      as computed inline when the row was written.
 *   3. shared-evidence clusters — the same device id or IP hash appearing on
 *      multiple referral rows (one browser/IP signing up several "friends",
 *      possibly across different referrers).
 *
 * IMPORTANT: overlap is evidence, not a verdict. A genuine in-person referral
 * ("try it, here's my laptop" / a sibling on the family computer) shares BOTH
 * the IP and the device — arguably the most organic referral there is. Treat
 * a hit as "look closer", and only action when corroborated by real farm
 * signals: dormant/aged-burner GitHub accounts, burst velocity, zero product
 * use, many referreds on one device (docs/freebuff-abuse-detection.md).
 * A 2026-07 case looked like a slam-dunk sock ring on these signals alone and
 * turned out to be a genuine user, his brother, and a buggy redemption flow.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/referral-sock-signals.ts
 *   infisical run --env=prod --silent -- bun scripts/referral-sock-signals.ts --days 30
 */

import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

const daysArgIdx = process.argv.indexOf('--days')
const DAYS = daysArgIdx >= 0 ? Number(process.argv[daysArgIdx + 1]) : 90
if (!Number.isFinite(DAYS) || DAYS <= 0) {
  console.error('usage: bun scripts/referral-sock-signals.ts [--days <n>]')
  process.exit(1)
}

async function main() {
  const cutoff = sql`now() - make_interval(days => ${DAYS})`

  console.log(`=== 1. referrals whose evidence matches the REFERRER (last ${DAYS}d) ===`)
  // The overlap predicates are computed ONCE in the inner select and reused
  // by the outer filter, so the displayed columns can never disagree with the
  // row filter. The IP probe mirrors computeReferrerOverlap's semantics
  // (live cache rows only — expired rows are superseded, never deleted).
  const overlap = await db.execute(sql`
    SELECT * FROM (
      SELECT
        r.referrer_id,
        ru.email                                   AS referrer_email,
        r.referred_id,
        fu.email                                   AS referred_email,
        r.created_at::date                         AS attributed,
        r.activated_at IS NOT NULL                 AS activated,
        r.revoked_at IS NOT NULL                   AS revoked,
        (r.referred_device_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM user_device ud
          WHERE ud.user_id = r.referrer_id AND ud.device_id = r.referred_device_id
        ))                                         AS device_overlap,
        (r.referred_ip_hash IS NOT NULL AND EXISTS (
          SELECT 1 FROM free_mode_country_access_cache c
          WHERE c.user_id = r.referrer_id AND c.client_ip_hash = r.referred_ip_hash
            AND c.expires_at > now()
        ))                                         AS ip_overlap,
        r.referrer_device_overlap                  AS flagged_device_at_attribution,
        r.referrer_ip_overlap                      AS flagged_ip_at_attribution
      FROM referral_v2 r
      JOIN "user" ru ON ru.id = r.referrer_id
      JOIN "user" fu ON fu.id = r.referred_id
      WHERE r.created_at >= ${cutoff}
    ) t
    WHERE t.device_overlap OR t.ip_overlap
       OR t.flagged_device_at_attribution OR t.flagged_ip_at_attribution
    ORDER BY t.device_overlap DESC, t.attributed DESC
  `)
  console.table(overlap)

  console.log(`\n=== 2. same device id on multiple referral rows (last ${DAYS}d) ===`)
  const deviceClusters = await db.execute(sql`
    SELECT
      r.referred_device_id,
      count(*)::int                                   AS referrals,
      count(DISTINCT r.referrer_id)::int              AS referrers,
      array_agg(fu.email ORDER BY r.created_at)       AS referred_emails
    FROM referral_v2 r
    JOIN "user" fu ON fu.id = r.referred_id
    WHERE r.referred_device_id IS NOT NULL AND r.created_at >= ${cutoff}
    GROUP BY r.referred_device_id
    HAVING count(*) >= 2
    ORDER BY referrals DESC
  `)
  console.table(deviceClusters)

  console.log(`\n=== 3. same IP hash on multiple referral rows (last ${DAYS}d) ===`)
  const ipClusters = await db.execute(sql`
    SELECT
      left(r.referred_ip_hash, 12)                    AS ip_hash_prefix,
      count(*)::int                                   AS referrals,
      count(DISTINCT r.referrer_id)::int              AS referrers,
      array_agg(fu.email ORDER BY r.created_at)       AS referred_emails
    FROM referral_v2 r
    JOIN "user" fu ON fu.id = r.referred_id
    WHERE r.referred_ip_hash IS NOT NULL AND r.created_at >= ${cutoff}
    GROUP BY r.referred_ip_hash
    HAVING count(*) >= 2
    ORDER BY referrals DESC
  `)
  console.table(ipClusters)

  console.log(
    '\nAction path: corroborate FIRST (scripts/glm-referral-investigate.ts — dormant GitHubs, burst velocity, no product use); overlap alone is consistent with an in-person referral. Only then revoke via scripts/glm-referral-clawback.ts.',
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
