/**
 * Clawback + ban for confirmed GLM referral farms. DRY-RUN by default.
 *
 * Targets only IRONCLAD farms to avoid false positives (see the ID-sweep
 * false-positive incident): a referrer with >= MIN_QUALIFIED qualified glm
 * referrals where >= DORMANT_FRAC of those qualified referreds are "socks" —
 * GitHub accounts that pass the 12-month bar but have 0 public repos, 0
 * followers, AND never ran the agent. These are bulk-registered / purchased
 * aged accounts (often identical creation dates), not real friends.
 *
 * On --commit it performs, in one transaction:
 *   1. clawback: referral.qualified_at = NULL, status='pending', completed_at=NULL
 *      for ALL programs of the farm referrer (web rows were farmed the same way)
 *   2. revoke:   referral_v2.revoked_at = now() for the farm referrer
 *   3. ban:      user.banned = true for the referrer AND every sock referred
 *      account (dormant + never coded). Referred accounts that actually coded
 *      are NOT banned.
 *   4. free_session rows for every banned user are deleted (frees slots)
 *
 * The burn-once ledger (referral_qualification.glm_bonus_consumed_at) is left
 * CONSUMED on purpose so the same GitHub identities can never re-farm.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-clawback.ts            # dry run
 *   infisical run --env=prod --silent -- bun scripts/glm-referral-clawback.ts --commit   # apply
 */

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql, inArray } from 'drizzle-orm'

const COMMIT = process.argv.includes('--commit')
const MIN_QUALIFIED = 3
const DORMANT_FRAC = 0.8

type FarmRow = {
  referrer_id: string
  email: string
  qualified: number
  socks: number
  sock_frac: number
  referrer_runs: number
}

async function main() {
  // ---- derive ironclad farm referrers ---------------------------------------
  const farms = (await db.execute(sql`
    WITH glm AS (
      SELECT r.referrer_id, r.referred_id, r.qualified_at
      FROM referral r WHERE r.program = 'glm'
    ),
    facts AS (
      SELECT
        g.referrer_id,
        g.referred_id,
        g.qualified_at,
        coalesce(qf.github_public_repos, 0) AS repos,
        coalesce(qf.github_followers, 0)    AS followers,
        (SELECT count(*) FROM agent_run ar WHERE ar.user_id = g.referred_id) AS runs
      FROM glm g
      LEFT JOIN account a
        ON a."userId" = g.referred_id AND a.provider = 'github'
      LEFT JOIN referral_qualification qf
        ON qf.github_user_id = a."providerAccountId"
    ),
    per AS (
      SELECT
        referrer_id,
        count(*) FILTER (WHERE qualified_at IS NOT NULL)::int AS qualified,
        count(*) FILTER (WHERE qualified_at IS NOT NULL
                          AND repos = 0 AND followers = 0 AND runs = 0)::int AS socks
      FROM facts
      GROUP BY referrer_id
    )
    SELECT
      p.referrer_id,
      u.email,
      p.qualified,
      p.socks,
      round((p.socks::numeric / NULLIF(p.qualified,0)), 2) AS sock_frac,
      (SELECT count(*) FROM agent_run ar WHERE ar.user_id = p.referrer_id) AS referrer_runs
    FROM per p
    JOIN "user" u ON u.id = p.referrer_id
    WHERE p.qualified >= ${MIN_QUALIFIED}
      AND p.socks::numeric / NULLIF(p.qualified,0) >= ${DORMANT_FRAC}
    ORDER BY p.qualified DESC
  `)) as unknown as FarmRow[]

  if (farms.length === 0) {
    console.log('No ironclad farms matched the predicate. Nothing to do.')
    return
  }

  const referrerIds = farms.map((f) => f.referrer_id)

  // ---- the sock referred accounts to ban (dormant + never coded) ------------
  const socks = (await db.execute(sql`
    SELECT DISTINCT
      r.referred_id,
      u.email,
      qf.github_login,
      r.referrer_id
    FROM referral r
    JOIN "user" u ON u.id = r.referred_id
    LEFT JOIN account a ON a."userId" = r.referred_id AND a.provider = 'github'
    LEFT JOIN referral_qualification qf ON qf.github_user_id = a."providerAccountId"
    WHERE r.program = 'glm'
      AND r.referrer_id IN (${sql.join(referrerIds.map((id) => sql`${id}`), sql`, `)})
      AND coalesce(qf.github_public_repos,0) = 0
      AND coalesce(qf.github_followers,0) = 0
      AND (SELECT count(*) FROM agent_run ar WHERE ar.user_id = r.referred_id) = 0
  `)) as unknown as Array<{
    referred_id: string
    email: string
    github_login: string | null
    referrer_id: string
  }>

  const sockIds = socks.map((s) => s.referred_id)
  const banIds = [...new Set([...referrerIds, ...sockIds])]

  // ---- count referral rows that would be clawed back ------------------------
  const [clawCount] = (await db.execute(sql`
    SELECT count(*)::int AS n
    FROM referral
    WHERE referrer_id IN (${sql.join(referrerIds.map((id) => sql`${id}`), sql`, `)})
      AND qualified_at IS NOT NULL
  `)) as unknown as Array<{ n: number }>

  // ---- report ---------------------------------------------------------------
  console.log(`\n=== ${COMMIT ? 'COMMIT' : 'DRY RUN'} — ironclad GLM farms (>=${MIN_QUALIFIED} qualified, >=${DORMANT_FRAC * 100}% sock) ===`)
  console.table(
    farms.map((f) => ({
      email: f.email,
      qualified: Number(f.qualified),
      socks: Number(f.socks),
      sock_frac: f.sock_frac,
      referrer_runs: Number(f.referrer_runs),
    })),
  )
  console.log(`\nreferrers to ban: ${referrerIds.length}`)
  console.log(`sock referred accounts to ban: ${sockIds.length}`)
  console.log(`total accounts to ban: ${banIds.length}`)
  console.log(`qualified referral rows to clawback: ${clawCount?.n ?? 0}`)

  console.log('\n=== sock referred accounts (will be banned) ===')
  console.table(
    socks.map((s) => ({
      referrer: farms.find((f) => f.referrer_id === s.referrer_id)?.email,
      github_login: s.github_login,
      referred_email: s.email,
    })),
  )

  if (!COMMIT) {
    console.log('\nDRY RUN — nothing changed. Re-run with --commit to apply.')
    return
  }

  // ---- apply ----------------------------------------------------------------
  await db.transaction(async (tx) => {
    // 1. clawback legacy referral rows (all programs for the farm referrer)
    const clawed = await tx
      .update(schema.referral)
      .set({ qualified_at: null, status: 'pending', completed_at: null })
      .where(
        sql`${schema.referral.referrer_id} IN (${sql.join(referrerIds.map((id) => sql`${id}`), sql`, `)}) AND ${schema.referral.qualified_at} IS NOT NULL`,
      )
      .returning({ referred: schema.referral.referred_id })

    // 2. revoke referral_v2 rows
    const revoked = await tx
      .update(schema.referralV2)
      .set({ revoked_at: sql`now()` })
      .where(
        sql`${schema.referralV2.referrer_id} IN (${sql.join(referrerIds.map((id) => sql`${id}`), sql`, `)}) AND ${schema.referralV2.revoked_at} IS NULL`,
      )
      .returning({ referred: schema.referralV2.referred_id })

    // 3. ban referrer + sock accounts
    const banned = await tx
      .update(schema.user)
      .set({ banned: true })
      .where(inArray(schema.user.id, banIds))
      .returning({ id: schema.user.id, email: schema.user.email })

    // 4. clear free_session slots for banned users
    const sessionsDeleted = await tx
      .delete(schema.freeSession)
      .where(inArray(schema.freeSession.user_id, banIds))
      .returning({ user_id: schema.freeSession.user_id })

    console.log('\n=== COMMITTED ===')
    console.log(`referral rows clawed back: ${clawed.length}`)
    console.log(`referral_v2 rows revoked:  ${revoked.length}`)
    console.log(`users banned:              ${banned.length}`)
    console.log(`free_session rows deleted: ${sessionsDeleted.length}`)
  })
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
