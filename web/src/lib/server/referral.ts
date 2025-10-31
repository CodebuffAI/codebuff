import { getReferralLink } from '@codebuff/common/util/referral'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/common/env'
import { eq, sql } from 'drizzle-orm'

export type ReferralStatus =
  | {
      reason: 'Referral Limit Reached' | 'Referrer Not Found' | 'Unknown Error'
      details?: {
        referralCount?: number
        msg: string
      }
    }
  | {
      reason: undefined
      referralLink: string
      details: {
        referralCount: number
      }
    }

export async function hasMaxedReferrals(
  userId: string,
): Promise<ReferralStatus> {
  try {
    const referralCount = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(schema.referral)
      .where(eq(schema.referral.referrer_id, userId))
      .then((result) => (result.length > 0 ? result[0].count : 0))

    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        referral_code: true,
        referral_limit: true,
      },
    })

    if (!user || !user.referral_code) {
      return {
        reason: 'Referrer Not Found',
        details: {
          referralCount,
          msg: `This referrer isn't registered with us. Please try again and reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} if the problem
          persists.`,
        },
      }
    }

    if (referralCount >= user.referral_limit) {
      return {
        reason: 'Referral Limit Reached',
        details: {
          referralCount,
          msg: 'This referrer has maxxed out the number of referrals they can make',
        },
      }
    }

    return {
      reason: undefined,
      referralLink: getReferralLink(user.referral_code),
      details: { referralCount },
    }
  } catch (error) {
    return {
      reason: 'Unknown Error',
      details: {
        msg: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
