import { redirect } from 'next/navigation'
import { env } from '@/env.mjs'

export default function RedeemPage({
  searchParams,
}: {
  searchParams: { referral_code?: string }
}) {
  const { referral_code } = searchParams

  if (referral_code) {
    redirect(`${env.NEXT_PUBLIC_APP_URL}/login?referral_code=${referral_code}`)
  } else {
    redirect(env.NEXT_PUBLIC_APP_URL)
  }
}
