'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import posthog from 'posthog-js'
import { useEffect } from 'react'

const CAPTURED_KEY = 'freebuff_attribution_captured'

/**
 * Persists ad-click / UTM params into PostHog as super-properties so any
 * funnel step can be segmented by acquisition channel (e.g. utm_source,
 * reddit_click_id). Captures all UTM sources, not just Reddit; the
 * `is_reddit_traffic` flag lets Reddit-specific reporting filter cheaply.
 */
export function AttributionCapture() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      if (sessionStorage.getItem(CAPTURED_KEY)) return
    } catch {
      // Continue even if storage is blocked.
    }

    const params = new URLSearchParams(window.location.search)
    const rdtCid = params.get('rdt_cid')?.trim()
    const utmSource = params.get('utm_source')?.trim()
    const utmMedium = params.get('utm_medium')?.trim()
    const utmCampaign = params.get('utm_campaign')?.trim()
    const utmContent = params.get('utm_content')?.trim()
    const utmTerm = params.get('utm_term')?.trim()

    const isReddit =
      Boolean(rdtCid) ||
      utmSource?.toLowerCase() === 'reddit' ||
      document.referrer.includes('reddit.com')

    // Nothing to attribute on this load — leave the session uncaptured so a
    // later navigation that does carry params can still be recorded.
    // (isReddit already implies rdtCid.)
    if (!utmSource && !isReddit) return

    try {
      sessionStorage.setItem(CAPTURED_KEY, '1')
    } catch {
      // Ignore blocked storage; still attempt to capture this load.
    }

    const setOnce: Record<string, string> = {}
    const eventProps: Record<string, string | boolean> = {
      is_reddit_traffic: isReddit,
    }

    if (rdtCid) {
      setOnce.reddit_click_id = rdtCid
      eventProps.reddit_click_id = rdtCid
    }
    if (utmSource) {
      setOnce.initial_utm_source = utmSource
      eventProps.utm_source = utmSource
    }
    if (utmMedium) {
      setOnce.initial_utm_medium = utmMedium
      eventProps.utm_medium = utmMedium
    }
    if (utmCampaign) {
      setOnce.initial_utm_campaign = utmCampaign
      eventProps.utm_campaign = utmCampaign
    }
    if (utmContent) {
      setOnce.initial_utm_content = utmContent
      eventProps.utm_content = utmContent
    }
    if (utmTerm) {
      setOnce.initial_utm_term = utmTerm
      eventProps.utm_term = utmTerm
    }

    posthog.capture(AnalyticsEvent.FREEBUFF_ATTRIBUTED, {
      ...eventProps,
      $set_once: setOnce,
    })

    // Super properties apply to every subsequent event this session.
    posthog.register(eventProps)
  }, [])

  return null
}
