/**
 * Backfill GLM referral rewards for referrers whose referral predates (or
 * missed) the GLM referral program.
 *
 * Why this exists: a pending `glm` referral row is created only when the
 * referred user loads the Freebuff web/cloud app (the convex-token redemption
 * hop) or — since the CLI /onboard fix — completes a CLI login. Referrals that
 * were redeemed under the `web` program *before* the GLM program shipped (or
 * whose GLM redeem never fired) have a `web` row but no `glm` row, so the
 * referrer never earned GLM even though the referral is perfectly valid.
 *
 * What it does:
 *   1. For every (referrer, referred) pair attributed under a source program
 *      (default: `web`) that has NO `glm` row, insert a PENDING `glm` row,
 *      mirroring the original attribution time. (ON CONFLICT DO NOTHING, so
 *      re-running is safe and idempotent.)
 *   2. Run the existing, tested GLM evaluator (evaluatePendingReferrals for the
 *      `glm` program) over the whole pending population. This is the SAME logic
 *      the live triggers + cron sweep use: it completes a row only when the
 *      referred user's GitHub account is linked AND >= 12 months old, and burns
 *      the per-GitHub-identity bonus once. Invalid referrals (no GitHub /
 *      too-new account) stay pending and grant nothing — the anti-abuse bar is
 *      preserved.
 *
 * It deliberately does NOT grant GLM to every referrer unconditionally: the
 * 12-month GitHub bar is what keeps paid GLM time from being farmed. "Valid
 * referral" === the referred account clears that bar, exactly as for a live
 * referral.
 *
 * DRY-RUN BY DEFAULT: prints the projected impact and mutates nothing. Pass
 * --apply to perform the backfill + evaluation.
 *
 * usage:
 *   # preview against prod (read-only):
 *   infisical run --env=prod --silent -- bun scripts/backfill-glm-referrals.ts
 *   # actually backfill:
 *   infisical run --env=prod --silent -- bun scripts/backfill-glm-referrals.ts --apply
 *   # widen the source evidence or bound the evaluation batch:
 *   infisical run --env=prod --silent -- bun scripts/backfill-glm-referrals.ts --programs=web,cli --limit=5000 --apply
 */

import {
  evaluateGlmReferralForReferredUser,
  type ReferralProgram,
} from '@codebuff/billing'
import db from '@codebuff/internal/db'
import { and, eq, sql } from 'drizzle-orm'
import * as schema from '@codebuff/internal/db/schema'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const GLM_AGE_MONTHS = 12

/** A console-backed logger satisfying the billing Logger contract. */
const logger: Logger = {
  debug: () => {},
  info: (obj: unknown, msg?: string) => console.log(msg ?? '', obj ?? ''),
  warn: (obj: unknown, msg?: string) => console.warn(msg ?? '', obj ?? ''),
  error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj ?? ''),
} as unknown as Logger

function parseFlags() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const get = (name: string): string | undefined => {
    const hit = args.find((a) => a.startsWith(`--${name}=`))
    return hit?.split('=')[1]
  }
  const programs = (get('programs') ?? 'web')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean) as ReferralProgram[]
  const limit = Number(get('limit') ?? '10000')
  return { apply, programs, limit }
}

/** Project what the backfill WOULD do, without mutating: every source-program
 *  pair lacking a glm row, bucketed by the referred user's cached GitHub facts
 *  (the same buckets the GLM evaluator decides on). */
async function previewMissingGlm(programs: ReferralProgram[]) {
  const programList = sql.join(
    programs.map((p) => sql`${p}`),
    sql`, `,
  )
  const rows = await db.execute(sql`
    WITH source_pairs AS (
      SELECT DISTINCT referrer_id, referred_id
      FROM referral
      WHERE program IN (${programList})
    ),
    missing_glm AS (
      SELECT sp.referrer_id, sp.referred_id
      FROM source_pairs sp
      WHERE NOT EXISTS (
        SELECT 1 FROM referral g
        WHERE g.referrer_id = sp.referrer_id
          AND g.referred_id = sp.referred_id
          AND g.program = 'glm'
      )
    ),
    joined AS (
      SELECT
        m.referrer_id,
        m.referred_id,
        a."providerAccountId" AS github_user_id,
        q.github_account_created_at,
        q.glm_bonus_consumed_at
      FROM missing_glm m
      LEFT JOIN account a
        ON a."userId" = m.referred_id AND a.provider = 'github'
      LEFT JOIN referral_qualification q
        ON q.github_user_id = a."providerAccountId"
    )
    SELECT
      CASE
        WHEN github_user_id IS NULL THEN 'no_github_account'
        WHEN github_account_created_at IS NULL THEN 'unknown_needs_github_fetch'
        WHEN glm_bonus_consumed_at IS NOT NULL THEN 'glm_bonus_already_consumed'
        WHEN github_account_created_at <= now() - (${GLM_AGE_MONTHS} || ' months')::interval
          THEN 'would_complete'
        ELSE 'too_new'
      END AS bucket,
      count(*)::int AS pairs,
      count(DISTINCT referrer_id)::int AS distinct_referrers
    FROM joined
    GROUP BY 1
    ORDER BY pairs DESC
  `)
  return [...rows]
}

/** Referrers who have NO completed glm row today but have >=1 'would_complete'
 *  backfill candidate — i.e. the people this backfill newly unlocks GLM for. */
async function countNewlyUnlockedReferrers(programs: ReferralProgram[]) {
  const programList = sql.join(
    programs.map((p) => sql`${p}`),
    sql`, `,
  )
  const [row] = [
    ...(await db.execute(sql`
      WITH source_pairs AS (
        SELECT DISTINCT referrer_id, referred_id
        FROM referral
        WHERE program IN (${programList})
      ),
      would_complete AS (
        SELECT sp.referrer_id
        FROM source_pairs sp
        LEFT JOIN account a
          ON a."userId" = sp.referred_id AND a.provider = 'github'
        LEFT JOIN referral_qualification q
          ON q.github_user_id = a."providerAccountId"
        WHERE NOT EXISTS (
            SELECT 1 FROM referral g
            WHERE g.referrer_id = sp.referrer_id
              AND g.referred_id = sp.referred_id
              AND g.program = 'glm'
          )
          AND q.github_account_created_at IS NOT NULL
          AND q.glm_bonus_consumed_at IS NULL
          AND q.github_account_created_at <= now() - (${GLM_AGE_MONTHS} || ' months')::interval
      )
      SELECT count(*)::int AS newly_unlocked_referrers
      FROM (
        SELECT wc.referrer_id
        FROM would_complete wc
        WHERE NOT EXISTS (
          SELECT 1 FROM referral cg
          WHERE cg.referrer_id = wc.referrer_id
            AND cg.program = 'glm'
            AND cg.qualified_at IS NOT NULL
        )
        GROUP BY wc.referrer_id
      ) t
    `)),
  ] as Array<{ newly_unlocked_referrers: number }>
  return row?.newly_unlocked_referrers ?? 0
}

/** Current GLM state: how many referrers already have GLM access. */
async function currentGlmState() {
  const [row] = [
    ...(await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS completed_glm_rows,
        count(DISTINCT referrer_id) FILTER (WHERE qualified_at IS NOT NULL)::int
          AS referrers_with_glm,
        count(*) FILTER (WHERE status = 'pending')::int AS pending_glm_rows
      FROM referral
      WHERE program = 'glm'
    `)),
  ] as Array<{
    completed_glm_rows: number
    referrers_with_glm: number
    pending_glm_rows: number
  }>
  return row
}

/** Insert pending `glm` rows for every source-program pair missing one,
 *  mirroring the earliest original attribution time. Returns rows inserted. */
async function backfillPendingGlmRows(programs: ReferralProgram[]) {
  const programList = sql.join(
    programs.map((p) => sql`${p}`),
    sql`, `,
  )
  const inserted = await db.execute(sql`
    INSERT INTO referral
      (referrer_id, referred_id, status, credits, is_legacy, program, created_at)
    SELECT DISTINCT ON (r.referrer_id, r.referred_id)
      r.referrer_id, r.referred_id, 'pending', 0, false, 'glm', r.created_at
    FROM referral r
    WHERE r.program IN (${programList})
    ORDER BY r.referrer_id, r.referred_id, r.created_at ASC
    ON CONFLICT (referrer_id, referred_id, program) DO NOTHING
    RETURNING referred_id
  `)
  return [...inserted].length
}

async function main() {
  const { apply, programs, limit } = parseFlags()

  console.log('=== backfill-glm-referrals ===')
  console.log({ mode: apply ? 'APPLY' : 'dry-run', sourcePrograms: programs, limit })

  const before = await currentGlmState()
  console.log('\n--- current GLM state ---')
  console.table([before])

  const preview = await previewMissingGlm(programs)
  console.log(
    `\n--- backfill candidates: ${programs.join('/')} pairs with no glm row, by referred-user GitHub facts ---`,
  )
  console.log(
    '(would_complete = referrer earns GLM; too_new/no_github_account = stays pending, grants nothing)',
  )
  console.table(preview)

  const newlyUnlocked = await countNewlyUnlockedReferrers(programs)
  console.log(
    `\n>>> referrers who go from NO GLM -> GLM via this backfill: ${newlyUnlocked}`,
  )

  if (!apply) {
    console.log(
      '\nDry-run only. Re-run with --apply to insert the pending glm rows and evaluate them.',
    )
    return
  }

  console.log('\n--- APPLYING ---')
  const insertedCount = await backfillPendingGlmRows(programs)
  console.log(`Inserted ${insertedCount} pending glm row(s).`)

  console.log('Evaluating pending glm referrals (same per-row logic as the cron sweep)…')
  const pending = await db
    .select({ referredId: schema.referral.referred_id })
    .from(schema.referral)
    .where(
      and(
        eq(schema.referral.program, 'glm'),
        eq(schema.referral.status, 'pending'),
      ),
    )
    .orderBy(schema.referral.created_at)
    .limit(limit)

  const outcomes: Record<string, number> = {}
  let completed = 0
  for (const { referredId } of pending) {
    try {
      const evaluation = await evaluateGlmReferralForReferredUser({
        userId: referredId,
        logger,
      })
      const key =
        evaluation.outcome === 'not_qualified'
          ? `not_qualified:${evaluation.reason}`
          : evaluation.outcome
      outcomes[key] = (outcomes[key] ?? 0) + 1
      if (evaluation.outcome === 'completed') completed++
    } catch (error) {
      outcomes['error'] = (outcomes['error'] ?? 0) + 1
      console.error('eval failed for', referredId, error)
    }
  }
  console.log('\n--- evaluation result ---')
  console.log({ evaluated: pending.length, completed })
  console.log('outcome breakdown:', outcomes)

  const after = await currentGlmState()
  console.log('\n--- GLM state after backfill ---')
  console.table([after])
  console.log({
    newlyCompletedGlmRows:
      after.completed_glm_rows - before.completed_glm_rows,
    newReferrersWithGlm: after.referrers_with_glm - before.referrers_with_glm,
  })

  if (pending.length >= limit) {
    console.log(
      `\n⚠ Hit the evaluation limit (${limit}). Re-run with a higher --limit to finish the backlog.`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
