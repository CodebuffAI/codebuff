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
import * as schema from '@codebuff/internal/db/schema'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import {
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
const NOREF = `${P}noref` // activation no-op (no referral row)

const ALL_USERS = [REFERRER, REFERRER2, A, G, SEED, BURN, ACT, NOREF]
const GH_A = `${P}ghA`
const GH_SHARED = `${P}ghShared`
const GH_ACT = `${P}ghAct`

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
    await testDb
      .insert(schema.referralV2)
      .values({
        referred_id: SEED,
        referrer_id: REFERRER,
        referred_github_user_id: GH_SHARED,
      })
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

  it('activation is a no-op for a user with no referral row', async () => {
    await recordReferralV2Activation({ referredId: NOREF, accessTier: 'full', conn: testDb })
    expect(await rowFor(NOREF)).toBeUndefined()
  })
})
