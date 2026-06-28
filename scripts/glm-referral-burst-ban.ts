/**
 * Ban bursty GLM referral operators WITHOUT touching their referred accounts.
 * DRY-RUN by default.
 *
 * Use when the referrer is clearly gaming the program (implausible velocity:
 * many qualified referrals all landing within minutes) but the referred GitHub
 * accounts look real (repos/followers), so we can't tell which referreds are
 * sock puppets vs genuine friends. We therefore ban only the operator and claw
 * back their inflated entitlement, and deliberately LEAVE the referred accounts
 * alone (no false-positive risk on possibly-real users).
 *
 * Predicate: a not-yet-banned referrer with >= MIN_QUALIFIED qualified glm
 * referrals whose qualified rows ALL landed within SPAN_MIN minutes.
 *
 * On --commit, in one transaction:
 *   1. clawback: referral.qualified_at=NULL, status='pending', completed_at=NULL
 *      for ALL programs of the referrer
 *   2. revoke:   referral_v2.revoked_at=now() for the referrer
 *   3. ban:      user.banned=true for the REFERRER ONLY
 *   4. delete the referrer's free_session rows
 * Referred accounts are never modified. Burn-once ledger left as-is.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-burst-ban.ts            # dry run
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-burst-ban.ts --commit   # apply
 */

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql, inArray } from 'drizzle-orm'

const COMMIT = process.argv.includes('--commit')
const MIN_QUALIFIED = 4
const SPAN_MIN = 120

async function main() {
  const targets = (await db.execute(sql`
    WITH per AS (
      SELECT
        referrer_id,
        count(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS qualified,
        EXTRACT(EPOCH FROM (
          max(created_at) FILTER (WHERE qualified_at IS NOT NULL)
          - min(created_at) FILTER (WHERE qualified_at IS NOT NULL)
        )) / 60.0 AS span_min
      FROM referral
      WHERE program = 'glm'
      GROUP BY referrer_id
    )
    SELECT u.id AS referrer_id, u.email, p.qualified, round(p.span_min::numeric, 1) AS span_min
    FROM per p
    JOIN "user" u ON u.id = p.referrer_id
    WHERE p.qualified >= ${MIN_QUALIFIED}
      AND p.span_min < ${SPAN_MIN}
      AND u.banned = false
    ORDER BY p.qualified DESC
  `)) as unknown as Array<{
    referrer_id: string
    email: string
    qualified: number
    span_min: number
  }>

  if (targets.length === 0) {
    console.log('No bursty unbanned referrers matched. Nothing to do.')
    return
  }

  const ids = targets.map((t) => t.referrer_id)
  const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `)

  const [claw] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM referral
    WHERE referrer_id IN (${idList}) AND qualified_at IS NOT NULL
  `)) as unknown as Array<{ n: number }>

  console.log(`\n=== ${COMMIT ? 'COMMIT' : 'DRY RUN'} — bursty operators (>=${MIN_QUALIFIED} qualified within <${SPAN_MIN} min, referrer-only ban) ===`)
  console.table(
    targets.map((t) => ({
      email: t.email,
      qualified: Number(t.qualified),
      span_min: t.span_min,
    })),
  )
  console.log(`\nreferrers to ban (referred accounts NOT touched): ${ids.length}`)
  console.log(`qualified referral rows to clawback: ${claw?.n ?? 0}`)

  if (!COMMIT) {
    console.log('\nDRY RUN — nothing changed. Re-run with --commit to apply.')
    return
  }

  await db.transaction(async (tx) => {
    const clawed = await tx
      .update(schema.referral)
      .set({ qualified_at: null, status: 'pending', completed_at: null })
      .where(sql`${schema.referral.referrer_id} IN (${idList}) AND ${schema.referral.qualified_at} IS NOT NULL`)
      .returning({ referred: schema.referral.referred_id })

    const revoked = await tx
      .update(schema.referralV2)
      .set({ revoked_at: sql`now()` })
      .where(sql`${schema.referralV2.referrer_id} IN (${idList}) AND ${schema.referralV2.revoked_at} IS NULL`)
      .returning({ referred: schema.referralV2.referred_id })

    const banned = await tx
      .update(schema.user)
      .set({ banned: true })
      .where(inArray(schema.user.id, ids))
      .returning({ email: schema.user.email })

    const sessionsDeleted = await tx
      .delete(schema.freeSession)
      .where(inArray(schema.freeSession.user_id, ids))
      .returning({ user_id: schema.freeSession.user_id })

    console.log('\n=== COMMITTED ===')
    console.log(`referral rows clawed back: ${clawed.length}`)
    console.log(`referral_v2 rows revoked:  ${revoked.length}`)
    console.log(`referrers banned:          ${banned.length}`)
    console.log(`free_session rows deleted: ${sessionsDeleted.length}`)
  })
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
