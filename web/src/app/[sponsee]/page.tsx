'use client'

import { redirect, useSearchParams } from 'next/navigation'

import { sponseeConfig } from '@/lib/constant'
import { storeSearchParams } from '@/lib/trackConversions'
import { useEffect } from 'react'

// Only allow sponsee names that are in the list of valid sponsees
const isValidSponseeName = (name: string) => {
  return name.toLowerCase() in sponseeConfig
}

export default function SponseePage({
  params,
}: {
  params: { sponsee: string }
}) {
  const sponseeName = params['sponsee'].toLowerCase()

  const searchParams = useSearchParams()

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  if (!isValidSponseeName(sponseeName)) {
    redirect('/')
  }

  // Redirect to home with utm_source
  redirect(
    `/referrals/${sponseeConfig[sponseeName as keyof typeof sponseeConfig].referralCode}?utm_source=youtube&referrer=${encodeURIComponent(sponseeName)}`
  )
}
