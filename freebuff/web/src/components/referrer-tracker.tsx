'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import posthog from 'posthog-js'
import { useEffect } from 'react'

export function ReferrerTracker() {
  useEffect(() => {
    const referrer = localStorage.getItem('freebuff_referrer')
    if (referrer) {
      posthog.capture(AnalyticsEvent.FREEBUFF_REFERRER_ATTRIBUTED, {
        referrer,
        $set_once: { freebuff_referrer: referrer },
      })
      localStorage.removeItem('freebuff_referrer')
    }
  }, [])

  return null
}
