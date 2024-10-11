export const getReferralLink = (referralCode: string): string =>
  `${process.env.NEXT_PUBLIC_APP_URL}/referrals/${referralCode}`
