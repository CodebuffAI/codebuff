export const getReferralLink = (referralCode: string): string =>
  `${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL}/referrals/${referralCode}`
