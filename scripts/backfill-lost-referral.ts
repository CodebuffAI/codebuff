/**
 * Replay a referral redemption that a product bug swallowed (e.g. the friend
 * clicked the invite link and signed in on /get-started before PR #306 made
 * that hop redeem the cookie).
 *
 * Deliberately NOT a rule bypass: it calls the same production functions the
 * web hop calls (redeemReferralCode for both programs + the referral_v2
 * dual-write), so every guard still applies — the 30-day signup window,
 * one-referrer-per-user, burn-once, caps. If the referred user no longer
 * passes a guard, this reports the rejection instead of forcing a row.
 * Qualification/activation are untouched: the referral still only counts once
 * the friend uses the product and their GitHub passes the age bar.
 *
 * usage:
 *   # dry run (read-only): shows both users + what each guard would say
 *   infisical run --env=prod --silent -- bun scripts/backfill-lost-referral.ts <referrer-email> <referred-email>
 *   # apply
 *   infisical run --env=prod --silent -- bun scripts/backfill-lost-referral.ts <referrer-email> <referred-email> --commit
 */
import { REFERRAL_SIGNUP_WINDOW_DAYS } from '@codebuff/common/constants/freebuff-referral-tiers'
import {
  recordReferralV2Attribution,
  redeemReferralCode,
} from '@codebuff/billing'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, or } from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const consoleLogger: Logger = {
  debug: (data, msg) => console.log(msg ?? '', data),
  info: (data, msg) => console.log(msg ?? '', data),
  warn: (data, msg) => console.warn(msg ?? '', data),
  error: (data, msg) => console.error(msg ?? '', data),
}

async function main() {
  const [referrerEmail, referredEmail] = process.argv.slice(2)
  const commit = process.argv.includes('--commit')
  if (!referrerEmail || !referredEmail) {
    console.error(
      'usage: bun scripts/backfill-lost-referral.ts <referrer-email> <referred-email> [--commit]',
    )
    process.exit(1)
  }

  const userByEmail = async (email: string) => {
    const [u] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1)
    return u
  }

  const referrer = await userByEmail(referrerEmail)
  const referred = await userByEmail(referredEmail)
  if (!referrer || !referred) {
    console.error(`user not found: ${!referrer ? referrerEmail : referredEmail}`)
    process.exit(1)
  }
  if (!referrer.referral_code) {
    console.error(`${referrerEmail} has no referral code`)
    process.exit(1)
  }

  const signupAgeDays =
    (Date.now() - referred.created_at.getTime()) / (24 * 60 * 60 * 1000)
  console.log('referrer:', {
    id: referrer.id,
    email: referrer.email,
    code: referrer.referral_code,
    banned: referrer.banned,
  })
  console.log('referred:', {
    id: referred.id,
    email: referred.email,
    signup: referred.created_at.toISOString(),
    signupAgeDays: signupAgeDays.toFixed(1),
    withinWindow: signupAgeDays <= REFERRAL_SIGNUP_WINDOW_DAYS,
    banned: referred.banned,
  })

  const existing = await db
    .select({
      referrer_id: schema.referralV2.referrer_id,
      created_at: schema.referralV2.created_at,
    })
    .from(schema.referralV2)
    .where(eq(schema.referralV2.referred_id, referred.id))
  console.log('existing referral_v2 row for referred:', existing)
  const legacy = await db
    .select({
      program: schema.referral.program,
      referrer_id: schema.referral.referrer_id,
      status: schema.referral.status,
    })
    .from(schema.referral)
    .where(
      or(
        eq(schema.referral.referred_id, referred.id),
        eq(schema.referral.referrer_id, referred.id),
      ),
    )
  console.log('existing legacy rows touching referred:', legacy)

  if (!commit) {
    console.log(
      '\nDRY RUN — no writes. Re-run with --commit to replay the redemption through the production guards.',
    )
    return
  }

  // Mirror syncWebReferralState: both legacy programs + the v2 dual-write. No
  // request context here, so no ip/device signals are recorded.
  const [webResult, glmResult] = await Promise.all([
    redeemReferralCode({
      userId: referred.id,
      referralCode: referrer.referral_code,
      program: 'web',
      logger: consoleLogger,
    }),
    redeemReferralCode({
      userId: referred.id,
      referralCode: referrer.referral_code,
      program: 'glm',
      logger: consoleLogger,
    }),
  ])
  console.log('redeem results:', { webResult, glmResult })

  // `already_referred` under THIS referrer means the legacy rows exist but
  // the v2 dual-write is missing (e.g. the legacy redeem predates the v2
  // table, or a partial failure) — writing the v2 row IS the repair. A
  // different legacy referrer stays rejected (first-referrer-wins).
  const alreadyReferredHere =
    !webResult.ok &&
    !glmResult.ok &&
    (webResult.error === 'already_referred' ||
      glmResult.error === 'already_referred') &&
    legacy.some((row) => row.referrer_id === referrer.id)

  if (webResult.ok || glmResult.ok || alreadyReferredHere) {
    const created = await recordReferralV2Attribution({
      referrerId: referrer.id,
      referredId: referred.id,
      logger: consoleLogger,
    })
    console.log('referral_v2 attribution created:', created)
  } else {
    console.log('both programs rejected — nothing written to referral_v2')
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
