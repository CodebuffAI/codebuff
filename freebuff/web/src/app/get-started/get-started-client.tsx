'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import posthog from 'posthog-js'
import { useEffect } from 'react'

/**
 * Invisible referral capture for /get-started. The page itself now renders the
 * exact same content as /cli; this component just preserves the existing
 * referral behavior (analytics + persisting the inviter name) so invite links
 * like /get-started?referrer=Bob keep working.
 */
export function GetStartedReferrerCapture({
  referrerName,
}: {
  referrerName: string | null
}) {
  useEffect(() => {
    posthog.capture(AnalyticsEvent.FREEBUFF_GET_STARTED_VIEWED, {
      referrer: referrerName,
    })
    if (referrerName) {
      try {
        localStorage.setItem('freebuff_referrer', referrerName)
      } catch {
        // Ignore storage failures (private mode, blocked storage, etc.).
      }
    }
  }, [referrerName])

  return null
}
