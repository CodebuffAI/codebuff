/**
 * Phase 3 backfill: populate the unified `referral_v2` table from the legacy
 * per-program `referral` rows + `free_session_admit` history, so the new read
 * model (getReferralStats) has the historical referrals once products switch to
 * it. Idempotent; safe to re-run.
 *
 * `cli` (codebuff Opus) referrals are EXCLUDED — only freebuff `web`/`glm`
 * referrals are migrated, so an Opus referral never grandfathers freebuff GLM.
 *
 * For each referred user (deduped to the referrer who earned a completion, else
 * the earliest), it:
 *   1. recordReferralV2Attribution — creates the one row (captures github).
 *   2. recordReferralV2Activation at the derived tier, when activated:
 *        - 'full'    if that referrer's glm referral completed (grandfather) OR
 *                    the user was ever admitted at the full tier,
 *        - 'limited' else if their web referral completed OR they were admitted
 *                    limited,
 *        - (skip)    otherwise — not activated.
 *
 * GLM grandfathering is also belt-and-suspenders: getGlmReferralEntitlement
 * already takes max(legacy glm score, new fullQualified), so no referrer loses
 * GLM even before/without this backfill. This just makes the new model the
 * source of truth.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/backfill-referral-v2.ts          # dry-run
 *   infisical run --env=prod --silent -- bun scripts/backfill-referral-v2.ts --apply
 */

import {
  recordReferralV2Activation,
  recordReferralV2Attribution,
} from '@codebuff/billing'
import db from '@codebuff/internal/db'
import { sql } from 'drizzle-orm'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'

interface PairRow {
  referrer_id: string
  referred_id: string
  created_at: Date
  glm_completed: boolean
  web_completed: boolean
  has_full: boolean | null
  has_limited: boolean | null
  first_admit: Date | null
}

/** The activation tier to backfill, or null when the user never activated. */
function backfillTier(row: PairRow): FreebuffAccessTier | null {
  if (row.glm_completed || row.has_full) return 'full'
  if (row.web_completed || row.has_limited) return 'limited'
  return null
}

async function loadPairs(): Promise<PairRow[]> {
  return [
    ...(await db.execute(sql`
      WITH pair_agg AS (
        -- Per (referrer, referred): did THIS pair earn a completion? cli rows
        -- are excluded entirely — those are codebuff Opus referrals and must not
        -- grandfather freebuff GLM.
        SELECT
          referrer_id,
          referred_id,
          min(created_at) AS created_at,
          bool_or(program = 'glm' AND qualified_at IS NOT NULL) AS glm_completed,
          bool_or(program = 'web' AND qualified_at IS NOT NULL) AS web_completed
        FROM referral
        WHERE program IN ('web', 'glm')
        GROUP BY referrer_id, referred_id
      ),
      ranked AS (
        -- One row per referred_id. Prefer the referrer who actually earned a
        -- completion (so a grandfathered tier is credited to the right person),
        -- then the earliest.
        SELECT p.*,
          row_number() OVER (
            PARTITION BY referred_id
            ORDER BY (glm_completed OR web_completed) DESC, created_at ASC
          ) AS rn
        FROM pair_agg p
      ),
      activation AS (
        SELECT user_id,
          bool_or(access_tier = 'full') AS has_full,
          bool_or(access_tier = 'limited') AS has_limited,
          min(admitted_at) AS first_admit
        FROM free_session_admit
        GROUP BY user_id
      )
      SELECT r.referrer_id, r.referred_id, r.created_at,
             r.glm_completed, r.web_completed,
             a.has_full, a.has_limited, a.first_admit
      FROM ranked r
      LEFT JOIN activation a ON a.user_id = r.referred_id
      WHERE r.rn = 1
    `)),
  ] as unknown as PairRow[]
}

/** Current referral_v2 row count. */
async function countReferralV2(): Promise<number> {
  const [row] = [
    ...(await db.execute(sql`SELECT count(*)::int AS n FROM referral_v2`)),
  ] as unknown as Array<{ n: number }>
  return row?.n ?? 0
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log('=== backfill-referral-v2 ===', { mode: apply ? 'APPLY' : 'dry-run' })

  const pairs = await loadPairs()
  const tiers = { full: 0, limited: 0, none: 0 }
  for (const p of pairs) {
    const t = backfillTier(p)
    tiers[t ?? 'none']++
  }
  console.log(`pairs (unique referred users, web/glm only): ${pairs.length}`)
  console.log('activation tier to backfill:', tiers)
  console.log(`current referral_v2 rows: ${await countReferralV2()}`)

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to write referral_v2.')
    return
  }

  let attributed = 0
  let activated = 0
  let errors = 0
  for (const p of pairs) {
    // Per-row isolation: a deleted user or transient error skips that pair
    // instead of aborting the whole backfill (it's idempotent, so re-running
    // picks up where it left off).
    try {
      const created = await recordReferralV2Attribution({
        referrerId: p.referrer_id,
        referredId: p.referred_id,
        now: p.created_at,
      })
      if (created) attributed++
      const tier = backfillTier(p)
      if (tier) {
        await recordReferralV2Activation({
          referredId: p.referred_id,
          accessTier: tier,
          now: p.first_admit ?? p.created_at,
        })
        activated++
      }
    } catch (error) {
      errors++
      console.error('skipped pair', {
        referredId: p.referred_id,
        referrerId: p.referrer_id,
        error,
      })
    }
  }

  console.log('\n--- applied ---')
  console.log({ attributed_new_rows: attributed, activations_set: activated, errors })
  console.log(`referral_v2 rows now: ${await countReferralV2()}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
