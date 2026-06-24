/**
 * One-off: look up a user by email and dump everything referral-related:
 * their user row (referral_code, etc.), any referral rows where they are the
 * referrer or the referred, and the referral_qualification ledger keyed to
 * their GitHub identity. Read-only.
 *
 * usage:
 *   infisical run --env=prod --silent -- bun scripts/lookup-referral-user.ts <email>
 */

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, or, sql } from 'drizzle-orm'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('usage: bun scripts/lookup-referral-user.ts <email>')
    process.exit(1)
  }

  const users = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))

  if (users.length === 0) {
    console.log(`No user found with email ${email}`)
    return
  }

  for (const u of users) {
    console.log('=== USER ===')
    console.log({
      id: u.id,
      email: u.email,
      name: u.name,
      referral_code: u.referral_code,
      referral_limit: u.referral_limit,
      created_at: u.created_at,
    })

    // OAuth accounts (to get the GitHub identity used by referral_qualification)
    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, u.id))
    console.log('--- accounts (provider / providerAccountId) ---')
    for (const a of accounts) {
      console.log({
        provider: (a as any).provider,
        providerAccountId: (a as any).providerAccountId,
      })
    }

    // Referrals where this user is the referrer
    const asReferrer = await db
      .select()
      .from(schema.referral)
      .where(eq(schema.referral.referrer_id, u.id))
    console.log(`--- referral rows where they are REFERRER (${asReferrer.length}) ---`)
    for (const r of asReferrer) console.log(r)

    // Referrals where this user is the referred
    const asReferred = await db
      .select()
      .from(schema.referral)
      .where(eq(schema.referral.referred_id, u.id))
    console.log(`--- referral rows where they are REFERRED (${asReferred.length}) ---`)
    for (const r of asReferred) console.log(r)

    // referral_qualification rows keyed to their user_id
    const quals = await db
      .select()
      .from(schema.referralQualification)
      .where(eq(schema.referralQualification.user_id, u.id))
    console.log(`--- referral_qualification rows (${quals.length}) ---`)
    for (const q of quals) console.log(q)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
