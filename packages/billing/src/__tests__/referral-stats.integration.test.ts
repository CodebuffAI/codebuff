/**
 * Integration tests for the unified referral READ model (referral-stats.ts)
 * against a real PostgreSQL database. Covers the SQL that the in-memory unit
 * tests can't — in particular the self-referral bump (`OR referred_id = X`) and
 * the tier split / qualification exclusions, which the highest-leverage line of
 * the activation-required change ships on.
 *
 * In CI these run against the postgres container (test-integration-* job).
 * Locally: `docker run -p 5432:5432 -e POSTGRES_USER=postgres -e
 * POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testdb postgres:16-alpine`, or set
 * DATABASE_URL to a test database.
 */
import * as schema from '@codebuff/internal/db/schema'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { getReferralStats } from '../referral-stats'

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/testdb'
const TEST_DATABASE_URL = process.env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL

const P = 'itest-refstats-'
// Referrers under test.
const R = `${P}R` // a referrer with a mix of referrals + their own self row
const SELFONLY = `${P}selfonly` // only ever referred (no referrals made)
const EMPTY = `${P}empty` // no rows at all
const INV = `${P}inviter` // referrer of the self rows above
// Referred friends of R.
const F_FULL = `${P}f_full` // activated full, aged → full
const F_LIMITED = `${P}f_limited` // activated limited, aged → limited
const F_TOONEW = `${P}f_toonew` // activated full, github too new → excluded
const F_REVOKED = `${P}f_revoked` // activated full, aged, revoked → excluded
const F_INACTIVE = `${P}f_inactive` // aged but never activated → excluded
const F_NOGITHUB = `${P}f_nogithub` // activated full but null github → excluded
// activated full, v2 github id NULL, BUT has a linked github account + aged
// qualification row → must be RESCUED by the resilient-join fallback and counted.
const R2 = `${P}R2` // referrer of F_NULLID
const F_NULLID = `${P}f_nullid`
// Burn-once guard: F_HELD's v2 id is NULL and its linked github is already held
// by OLDHOLDER's row (a re-signup), so the fallback must NOT re-credit R3.
const R3 = `${P}R3`
const F_HELD = `${P}f_held`
const OLDHOLDER = `${P}f_oldholder`

const ALL_USERS = [
  R,
  SELFONLY,
  EMPTY,
  INV,
  F_FULL,
  F_LIMITED,
  F_TOONEW,
  F_REVOKED,
  F_INACTIVE,
  F_NOGITHUB,
  R2,
  F_NULLID,
  R3,
  F_HELD,
  OLDHOLDER,
]

const gh = (u: string) => `${u}-gh`
// github_user_ids that get a qualification row (F_NOGITHUB intentionally omitted).
const QUAL_GHS = [
  gh(F_FULL),
  gh(F_LIMITED),
  gh(F_TOONEW),
  gh(F_REVOKED),
  gh(F_INACTIVE),
  gh(R), // R's own (self-bump) github
  gh(SELFONLY),
  gh(F_NULLID), // qualification keyed to the linked account, not the (null) v2 id
  gh(F_HELD), // held by OLDHOLDER's row → fallback must be blocked for F_HELD
]

let client: ReturnType<typeof postgres>
let testDb: ReturnType<typeof drizzle<typeof schema>>

const monthsAgo = (n: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d
}

describe('getReferralStats (real DB)', () => {
  beforeAll(async () => {
    client = postgres(TEST_DATABASE_URL)
    testDb = drizzle(client, { schema })

    await testDb
      .insert(schema.user)
      .values(
        ALL_USERS.map((id) => ({ id, email: `${id}@codebuff.test`, name: id })),
      )
      .onConflictDoNothing()

    // Qualification rows: aged (>4mo) for everyone except F_TOONEW (1mo).
    await testDb
      .insert(schema.referralQualification)
      .values(
        QUAL_GHS.map((ghId) => ({
          github_user_id: ghId,
          qualified: true,
          github_account_created_at:
            ghId === gh(F_TOONEW) ? monthsAgo(1) : monthsAgo(6),
          checked_at: new Date(),
        })),
      )
      .onConflictDoNothing()

    // F_NULLID has a linked GitHub account, but its referral_v2 row's id is NULL
    // (the backfill-gap bug). The resilient join must rescue it via this account.
    await testDb
      .insert(schema.account)
      .values([
        {
          userId: F_NULLID,
          type: 'oauth',
          provider: 'github',
          providerAccountId: gh(F_NULLID),
        },
        // F_HELD currently owns the github that OLDHOLDER's row already burned.
        {
          userId: F_HELD,
          type: 'oauth',
          provider: 'github',
          providerAccountId: gh(F_HELD),
        },
      ])
      .onConflictDoNothing()

    const now = new Date()
    await testDb
      .insert(schema.referralV2)
      .values([
        // R's referrals.
        { referred_id: F_FULL, referrer_id: R, referred_github_user_id: gh(F_FULL), activated_at: now, activation_access_tier: 'full' },
        { referred_id: F_LIMITED, referrer_id: R, referred_github_user_id: gh(F_LIMITED), activated_at: now, activation_access_tier: 'limited' },
        { referred_id: F_TOONEW, referrer_id: R, referred_github_user_id: gh(F_TOONEW), activated_at: now, activation_access_tier: 'full' },
        { referred_id: F_REVOKED, referrer_id: R, referred_github_user_id: gh(F_REVOKED), activated_at: now, activation_access_tier: 'full', revoked_at: now },
        { referred_id: F_INACTIVE, referrer_id: R, referred_github_user_id: gh(F_INACTIVE), activated_at: null, activation_access_tier: null },
        { referred_id: F_NOGITHUB, referrer_id: R, referred_github_user_id: null, activated_at: now, activation_access_tier: 'full' },
        // Self rows: R and SELFONLY were themselves referred (by INV).
        { referred_id: R, referrer_id: INV, referred_github_user_id: gh(R), activated_at: now, activation_access_tier: 'full' },
        { referred_id: SELFONLY, referrer_id: INV, referred_github_user_id: gh(SELFONLY), activated_at: now, activation_access_tier: 'limited' },
        // NULL v2 id, but a linked + aged github → rescued by the resilient join.
        { referred_id: F_NULLID, referrer_id: R2, referred_github_user_id: null, activated_at: now, activation_access_tier: 'full' },
        // Burn-once: OLDHOLDER already holds gh(F_HELD); F_HELD's row is NULL and
        // its account resolves to the same github → fallback must be BLOCKED.
        { referred_id: OLDHOLDER, referrer_id: INV, referred_github_user_id: gh(F_HELD), activated_at: now, activation_access_tier: 'full' },
        { referred_id: F_HELD, referrer_id: R3, referred_github_user_id: null, activated_at: now, activation_access_tier: 'full' },
      ])
      .onConflictDoNothing()
  })

  afterAll(async () => {
    if (!testDb) return
    await testDb
      .delete(schema.referralV2)
      .where(inArray(schema.referralV2.referred_id, ALL_USERS))
    await testDb
      .delete(schema.referralQualification)
      .where(inArray(schema.referralQualification.github_user_id, QUAL_GHS))
    await testDb
      .delete(schema.account)
      .where(inArray(schema.account.userId, ALL_USERS))
    await testDb.delete(schema.user).where(inArray(schema.user.id, ALL_USERS))
    await client.end()
  })

  it('counts qualified+activated referrals by tier, and adds the self-referral bump', async () => {
    // F_FULL (full) + R's own self row (full) = 2 full; F_LIMITED = 1 limited.
    // Excluded: F_TOONEW (github <4mo), F_REVOKED (revoked), F_INACTIVE (not
    // activated), F_NOGITHUB (no github → qualification join drops it).
    const stats = await getReferralStats({ referrerId: R, conn: testDb })
    expect(stats).toEqual({ fullQualified: 2, limitedQualified: 1 })
  })

  it('credits a user who was only referred (self-bump alone) at their own tier', async () => {
    const stats = await getReferralStats({ referrerId: SELFONLY, conn: testDb })
    expect(stats).toEqual({ fullQualified: 0, limitedQualified: 1 })
  })

  it('returns zeros for a user with no referrals', async () => {
    const stats = await getReferralStats({ referrerId: EMPTY, conn: testDb })
    expect(stats).toEqual({ fullQualified: 0, limitedQualified: 0 })
  })

  it('rescues a referral whose v2 github id is NULL via the linked github account', async () => {
    // The backfill-gap case: F_NULLID activated full and has a linked, aged
    // github, but the denormalized referred_github_user_id was never written.
    // The resilient join must still count it (was silently dropped before).
    const stats = await getReferralStats({ referrerId: R2, conn: testDb })
    expect(stats).toEqual({ fullQualified: 1, limitedQualified: 0 })
  })

  it('does NOT rescue a NULL-id row whose github is already burned by another referral', async () => {
    // F_HELD activated full with a linked aged github, but that github is already
    // held by OLDHOLDER's row. The fallback's burn-once guard must block it, so
    // R3 gets no credit — otherwise one github counts for two referrers.
    const stats = await getReferralStats({ referrerId: R3, conn: testDb })
    expect(stats).toEqual({ fullQualified: 0, limitedQualified: 0 })
  })
})
