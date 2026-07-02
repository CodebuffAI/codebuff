/**
 * Integration tests for the unified referral write side (referral-v2.ts)
 * against a real PostgreSQL database — exercises attribution upsert semantics
 * (first-referrer-wins, burn-once, Google-only), and activation tier
 * transitions, which the in-memory unit tests can't cover.
 *
 * In CI these run against the postgres container (test-integration-* job).
 * Locally: `docker run -p 5432:5432 -e POSTGRES_USER=postgres -e
 * POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testdb postgres:16-alpine`, or set
 * DATABASE_URL to a test database.
 */
import {
  FREEBUFF_REFERRAL_SIGNUP_LIMIT,
  REFERRAL_SIGNUP_WINDOW_DAYS,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import * as schema from '@codebuff/internal/db/schema'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import {
  linkReferralV2GithubId,
  recordReferralV2Activation,
  recordReferralV2Attribution,
} from '../referral-v2'

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/testdb'
const TEST_DATABASE_URL = process.env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL

const P = 'itest-refv2-'
const REFERRER = `${P}referrer`
const REFERRER2 = `${P}referrer2`
const A = `${P}A` // github ghA — happy path / idempotency / first-referrer-wins
const G = `${P}google` // no github
const SEED = `${P}seed` // pre-seeds a burn-once github
const BURN = `${P}burn` // re-signup of the seed github → burn-once blocks it
const ACT = `${P}act` // activation tier transitions
const EDGE = `${P}edge` // activated row with a NULL tier (legacy/backfill shape)
const NOREF = `${P}noref` // activation no-op (no referral row)
const LINK = `${P}link` // null-github referral → backfilled on github link
const LINK2 = `${P}link2` // burn-once: can't claim a github another row holds
const RV1 = `${P}rv1` // reverse-referral pair
const RV2 = `${P}rv2`
const OLDUSER = `${P}old` // signup outside the 30-day attribution window
const LIMITER = `${P}limiter` // referrer at the signup cap

const ALL_USERS = [
  REFERRER,
  REFERRER2,
  A,
  G,
  SEED,
  BURN,
  ACT,
  EDGE,
  NOREF,
  LINK,
  LINK2,
  RV1,
  RV2,
  OLDUSER,
  LIMITER,
]
const GH_A = `${P}ghA`
const GH_SHARED = `${P}ghShared`
const GH_ACT = `${P}ghAct`
const GH_LINK = `${P}ghLink`

let client: ReturnType<typeof postgres>
let testDb: ReturnType<typeof drizzle<typeof schema>>

async function rowFor(referredId: string) {
  const [row] = await testDb
    .select()
    .from(schema.referralV2)
    .where(eq(schema.referralV2.referred_id, referredId))
    .limit(1)
  return row
}

describe('referral-v2 write side (real DB)', () => {
  beforeAll(async () => {
    client = postgres(TEST_DATABASE_URL)
    testDb = drizzle(client, { schema })

    // Reset first: a prior run hard-killed between a write and afterAll (e.g.
    // the CI retry wrapper's timeout) would otherwise leave activated/linked
    // rows that onConflictDoNothing preserves, failing every retry attempt.
    await testDb
      .delete(schema.referralV2)
      .where(inArray(schema.referralV2.referred_id, ALL_USERS))

    await testDb
      .insert(schema.user)
      .values(
        ALL_USERS.map((id) => ({
          id,
          email: `${id}@codebuff.test`,
          name: id,
        })),
      )
      .onConflictDoNothing()

    // GitHub links: A→ghA, BURN→ghShared, ACT→ghAct. G is Google-only (none).
    await testDb
      .insert(schema.account)
      .values([
        { userId: A, type: 'oauth', provider: 'github', providerAccountId: GH_A },
        { userId: BURN, type: 'oauth', provider: 'github', providerAccountId: GH_SHARED },
        { userId: ACT, type: 'oauth', provider: 'github', providerAccountId: GH_ACT },
      ])
      .onConflictDoNothing()

    // Pre-seed a referral whose burn-once github is GH_SHARED (as if the SEED
    // user already consumed it), so a later re-signup under BURN is blocked.
    // LINK / LINK2 are referrals written with a null github (attributed before
    // GitHub linked) used by the github-backfill tests.
    await testDb
      .insert(schema.referralV2)
      .values([
        { referred_id: SEED, referrer_id: REFERRER, referred_github_user_id: GH_SHARED },
        { referred_id: LINK, referrer_id: REFERRER, referred_github_user_id: null },
        { referred_id: LINK2, referrer_id: REFERRER, referred_github_user_id: null },
      ])
      .onConflictDoNothing()
  })

  afterAll(async () => {
    if (!testDb) return
    await testDb
      .delete(schema.referralV2)
      .where(inArray(schema.referralV2.referred_id, ALL_USERS))
    await testDb
      .delete(schema.account)
      .where(inArray(schema.account.userId, ALL_USERS))
    await testDb.delete(schema.user).where(inArray(schema.user.id, ALL_USERS))
    await client.end()
  })

  it('creates an attribution row and captures the referred GitHub id', async () => {
    const created = await recordReferralV2Attribution({
      referrerId: REFERRER,
      referredId: A,
      conn: testDb,
    })
    expect(created).toBe(true)
    const row = await rowFor(A)
    expect(row.referrer_id).toBe(REFERRER)
    expect(row.referred_github_user_id).toBe(GH_A)
    expect(row.activated_at).toBeNull()
    expect(row.activation_access_tier).toBeNull()
  })

  it('is idempotent and first-referrer-wins (a second referrer cannot overwrite)', async () => {
    const again = await recordReferralV2Attribution({
      referrerId: REFERRER2,
      referredId: A,
      conn: testDb,
    })
    expect(again).toBe(false)
    expect((await rowFor(A)).referrer_id).toBe(REFERRER) // unchanged
  })

  it('allows a Google-only (no GitHub) referred user with a null github id', async () => {
    const created = await recordReferralV2Attribution({
      referrerId: REFERRER,
      referredId: G,
      conn: testDb,
    })
    expect(created).toBe(true)
    expect((await rowFor(G)).referred_github_user_id).toBeNull()
  })

  it('enforces burn-once: a GitHub identity already referred cannot be referred again', async () => {
    // BURN links GH_SHARED, which SEED already consumed → unique conflict.
    const created = await recordReferralV2Attribution({
      referrerId: REFERRER2,
      referredId: BURN,
      conn: testDb,
    })
    expect(created).toBe(false)
    expect(await rowFor(BURN)).toBeUndefined()
  })

  it('refuses a self-referral (referrer === referred)', async () => {
    const created = await recordReferralV2Attribution({
      referrerId: A,
      referredId: A,
      conn: testDb,
    })
    expect(created).toBe(false)
  })

  it('activates: stamps activated_at once and upgrades limited → full, never down', async () => {
    await recordReferralV2Attribution({
      referrerId: REFERRER,
      referredId: ACT,
      conn: testDb,
    })

    await recordReferralV2Activation({ referredId: ACT, accessTier: 'limited', conn: testDb })
    const first = await rowFor(ACT)
    expect(first.activation_access_tier).toBe('limited')
    expect(first.activated_at).not.toBeNull()
    const firstActivatedAt = first.activated_at!.getTime()

    await recordReferralV2Activation({ referredId: ACT, accessTier: 'full', conn: testDb })
    const upgraded = await rowFor(ACT)
    expect(upgraded.activation_access_tier).toBe('full')
    // activated_at is stamped once, not moved.
    expect(upgraded.activated_at!.getTime()).toBe(firstActivatedAt)

    await recordReferralV2Activation({ referredId: ACT, accessTier: 'limited', conn: testDb })
    expect((await rowFor(ACT)).activation_access_tier).toBe('full') // no downgrade
  })

  it('fills in the tier on an activated row whose tier is NULL, keeping the stamp', async () => {
    // Legacy/backfill shape: activated_at set but no tier recorded.
    const stamped = new Date('2026-01-02T03:04:05.000Z')
    await testDb.insert(schema.referralV2).values({
      referred_id: EDGE,
      referrer_id: REFERRER,
      activated_at: stamped,
    })

    await recordReferralV2Activation({ referredId: EDGE, accessTier: 'limited', conn: testDb })
    const row = await rowFor(EDGE)
    expect(row.activation_access_tier).toBe('limited')
    expect(row.activated_at!.getTime()).toBe(stamped.getTime())
  })

  it('activation is a no-op for a user with no referral row', async () => {
    await recordReferralV2Activation({ referredId: NOREF, accessTier: 'full', conn: testDb })
    expect(await rowFor(NOREF)).toBeUndefined()
  })

  it('backfills a null github id when the referred user links GitHub', async () => {
    expect((await rowFor(LINK)).referred_github_user_id).toBeNull()
    await linkReferralV2GithubId({ referredId: LINK, githubUserId: GH_LINK, conn: testDb })
    expect((await rowFor(LINK)).referred_github_user_id).toBe(GH_LINK)
  })

  it('does not overwrite a github id that is already set', async () => {
    await linkReferralV2GithubId({
      referredId: LINK,
      githubUserId: `${P}ghOther`,
      conn: testDb,
    })
    expect((await rowFor(LINK)).referred_github_user_id).toBe(GH_LINK) // unchanged
  })

  it('respects burn-once: skips a github id another referral already holds', async () => {
    // LINK already holds GH_LINK; LINK2 trying to claim it is a no-op.
    await linkReferralV2GithubId({ referredId: LINK2, githubUserId: GH_LINK, conn: testDb })
    expect((await rowFor(LINK2)).referred_github_user_id).toBeNull()
  })

  it('github backfill is a no-op for a user with no referral row', async () => {
    await linkReferralV2GithubId({
      referredId: NOREF,
      githubUserId: `${P}ghNoref`,
      conn: testDb,
    })
    expect(await rowFor(NOREF)).toBeUndefined()
  })

  it('refuses a reverse referral (B cannot refer A after A referred B)', async () => {
    expect(
      await recordReferralV2Attribution({
        referrerId: RV1,
        referredId: RV2,
        conn: testDb,
      }),
    ).toBe(true)
    // RV2 trying to refer RV1 back is a reverse referral → refused.
    expect(
      await recordReferralV2Attribution({
        referrerId: RV2,
        referredId: RV1,
        conn: testDb,
      }),
    ).toBe(false)
    expect(await rowFor(RV1)).toBeUndefined()
  })

  it('refuses attribution outside the 30-day signup window', async () => {
    await testDb
      .update(schema.user)
      .set({
        created_at: new Date(
          Date.now() - (REFERRAL_SIGNUP_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000,
        ),
      })
      .where(eq(schema.user.id, OLDUSER))
    const created = await recordReferralV2Attribution({
      referrerId: REFERRER,
      referredId: OLDUSER,
      conn: testDb,
    })
    expect(created).toBe(false)
    expect(await rowFor(OLDUSER)).toBeUndefined()
  })

  it('refuses attribution once the referrer hits the signup cap', async () => {
    const filler = Array.from(
      { length: FREEBUFF_REFERRAL_SIGNUP_LIMIT },
      (_, i) => `${P}fill-${i}`,
    )
    const oneMore = `${P}one-more`
    const extra = [...filler, oneMore]
    await testDb
      .insert(schema.user)
      .values(
        extra.map((id) => ({ id, email: `${id}@codebuff.test`, name: id })),
      )
      .onConflictDoNothing()
    // LIMITER already sits at exactly the signup cap.
    await testDb
      .insert(schema.referralV2)
      .values(filler.map((id) => ({ referred_id: id, referrer_id: LIMITER })))
      .onConflictDoNothing()

    try {
      const created = await recordReferralV2Attribution({
        referrerId: LIMITER,
        referredId: oneMore,
        conn: testDb,
      })
      expect(created).toBe(false)
      expect(await rowFor(oneMore)).toBeUndefined()
    } finally {
      await testDb
        .delete(schema.referralV2)
        .where(inArray(schema.referralV2.referred_id, extra))
      await testDb.delete(schema.user).where(inArray(schema.user.id, extra))
    }
  })
})
