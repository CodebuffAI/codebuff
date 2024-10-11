import { eq, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import db from '../../db'
import { getReferralLink } from '../referral'
import { MAX_REFERRALS } from '../../constants'

export async function hasMaxedReferrals(userId: string): Promise<
  | {
      reason:
        | 'You have reached your usage limit'
        | "Your user isn't in our system"
    }
  | {
      reason: undefined
      referralLink: string
    }
> {
  const referral = await db
    .select({
      referralCode: schema.user.referral_code,
      limitReached: sql<boolean>`count(*) >= ${MAX_REFERRALS}`,
    })
    .from(schema.referral)
    .leftJoin(schema.user, eq(schema.referral.referrer_id, schema.user.id))
    .where(eq(schema.referral.referrer_id, userId))
    .groupBy(schema.user.referral_code)
    .then((result) => (result.length > 0 ? result[0] : undefined))

  if (!referral || !referral.referralCode) {
    return { reason: "Your user isn't in our system" }
  }

  if (referral.limitReached) {
    return { reason: 'You have reached your usage limit' }
  }

  return {
    reason: undefined,
    referralLink: getReferralLink(referral.referralCode),
  }
}
