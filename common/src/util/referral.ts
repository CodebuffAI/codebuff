import { eq, count } from 'drizzle-orm'
import * as schema from '../db/schema'

export async function generateReferralLink(db: any, userId: string, appUrl: string) {
  const referralCount = await db
    .select({ count: count() })
    .from(schema.referral)
    .where(eq(schema.referral.referrer_id, userId))
    .then((result: any) => result[0]?.count ?? 0)

  if (referralCount < 5) {
    const user = await db
      .select({ referralCode: schema.user.referral_code })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .then((users: any) => users[0])

    if (user?.referralCode) {
      return `${appUrl}/referrals/${user.referralCode}`
    }
  }

  return undefined
}
