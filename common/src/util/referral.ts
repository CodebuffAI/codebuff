import { env } from '@codebuff/common/env'

export const getReferralLink = (referralCode: string): string =>
  `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/referrals/${referralCode}`
