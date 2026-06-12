'use client'

import { useEffect } from 'react'

import { storeReferralCookie } from '@/app/web/actions/referral'

/**
 * Reads `?ref=CODE` from the URL and persists it in the httpOnly
 * `vly_referral_code` cookie (via a server action) so signup attribution
 * works. Reads window.location directly instead of useSearchParams to avoid
 * needing a Suspense boundary in the root layout.
 */
export function ReferralCodeCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) {
      void storeReferralCookie(ref)
    }
  }, [])

  return null
}
