import { PostHog } from 'posthog-node'

import { AnalyticsEvent } from 'common/src/constants/analytics-events'

import { env } from './env.mjs'
import { logger } from './util/logger'

let client: PostHog | undefined

export function initAnalytics() {
  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST_URL) {
    throw new Error(
      'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_HOST_URL is not set'
    )
  }

  client = new PostHog(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
  })
}
export async function flushAnalytics() {
  if (!client) {
    return
  }
  await client.flush()
}

export function trackEvent(
  event: AnalyticsEvent,
  userId: string,
  properties?: Record<string, any>
) {
  if (!client) {
    throw new Error('Analytics client not initialized')
  }

  if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    logger.info({ event }, 'Analytics event tracked')
    return
  }

  client.capture({
    distinctId: userId,
    event,
    properties,
  })
}

// Designed for contexts where we don't guarantee
// that we've run an init() ahead of time, or a flush() later
export async function trackEventServerless(
  event: AnalyticsEvent,
  userId: string,
  properties?: Record<string, any>
) {
  initAnalytics()
  trackEvent(event, userId, properties)
  await flushAnalytics()
}
