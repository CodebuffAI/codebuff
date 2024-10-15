import { eq, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import db from '../../db'
import { getReferralLink } from '../referral'
import { MAX_REFERRALS } from '../../constants'

export async function hasMaxedReferrals(userId: string): Promise<
  | {
      reason:
        | 'You have maxxed out the number of referrals you can make. Thanks for your support!'
        | "Your user isn't in our system"
    }
  | {
      reason: undefined
      referralLink: string
    }
> {
  const limitReached = await db
    .select({
      limitReached: sql<boolean>`count(*) >= ${MAX_REFERRALS}`,
    })
    .from(schema.referral)
    .where(eq(schema.referral.referrer_id, userId))
    .then((result) => (result.length > 0 ? result[0].limitReached : false))
  if (limitReached) {
    return {
      reason:
        'You have maxxed out the number of referrals you can make. Thanks for your support!',
    }
  }

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      referral_code: true,
    },
  })

  if (!user || !user.referral_code) {
    return { reason: "Your user isn't in our system" }
  }

  return {
    reason: undefined,
    referralLink: getReferralLink(user.referral_code),
  }
}
