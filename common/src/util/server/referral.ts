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
        | 'An error occurred while checking referrals'
    }
  | {
      reason: undefined
      referralLink: string
    }
> {
  try {
    const referralCount = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(schema.referral)
      .where(eq(schema.referral.referrer_id, userId))
      .then((result) => (result.length > 0 ? result[0].count : 0))

    if (referralCount >= MAX_REFERRALS) {
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
  } catch (error) {
    return { reason: 'An error occurred while checking referrals' }
  }
}
