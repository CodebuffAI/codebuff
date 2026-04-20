'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import posthog from 'posthog-js'
import { useEffect } from 'react'

export function ReferrerTracker() {
  useEffect(() => {
    const referrer = localStorage.getItem('codebuff_referrer')
    if (referrer) {
      posthog.capture(AnalyticsEvent.CODEBUFF_REFERRER_ATTRIBUTED, {
        referrer,
        $set_once: { codebuff_referrer: referrer },
      })
      localStorage.removeItem('codebuff_referrer')
    }
  }, [])

  return null
}
