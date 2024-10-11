import { eq, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import db from '../db'

export const MAX_REFERRALS = 5

export async function hasMaxedReferrals(userId: string): Promise<
  | {
      reason: 'limitReached' | 'noReferralCode'
    }
  | {
      reason: undefined
      referralLink: string
    }
> {
  const referral = await db
    .select({
      limitReached: sql<boolean>`count(*) >= ${MAX_REFERRALS}`,
      referralCode: schema.user.referral_code,
    })
    .from(schema.referral)
    .where(eq(schema.referral.referrer_id, userId))
    .then((result) => (result.length > 0 ? result[0] : undefined))

  if (!referral) {
    return { reason: 'noReferralCode' }
  }

  if (referral.limitReached) {
    return { reason: 'limitReached' }
  }

  return {
    reason: undefined,
    referralLink: getReferralLink(referral.referralCode),
  }
}

export const getReferralLink = (referralCode: string): string =>
  `${process.env.NEXT_PUBLIC_APP_URL}/referrals/${referralCode}`
