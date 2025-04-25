import { AnalyticsEvent } from 'common/src/constants/analytics-events'
import { PostHog } from 'posthog-node'

// Store the identified user ID
let currentUserId: string | undefined
let client: PostHog | undefined

export function initAnalytics() {
  if (
    !process.env.NEXT_PUBLIC_POSTHOG_API_KEY ||
    !process.env.NEXT_PUBLIC_POSTHOG_HOST_URL
  ) {
    throw new Error(
      'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_HOST_URL is not set'
    )
  }

  client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_API_KEY, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST_URL,
  })
}
export function flushAnalytics() {
  if (!client) {
    return
  }
  client.flush()
}

export function trackEvent(
  event: AnalyticsEvent,
  userId?: string,
  properties?: Record<string, any>
) {
  const distinctId = userId || currentUserId
  if (!distinctId) {
    if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
      console.log(
        '[dev] Analytics event dropped due to missing user ID:',
        event
      )
    }
    return
  }
  if (!client) {
    throw new Error('Analytics client not initialized')
  }

  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    console.log('[dev] Analytics event tracked:', event)
    return
  }

  client.capture({
    distinctId,
    event,
    properties,
  })
}

export function identifyUser(userId: string, properties?: Record<string, any>) {
  // Store the user ID for future events
  currentUserId = userId

  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    console.log('[dev] Analytics user identified:', userId)
    return
  }

  if (!client) {
    throw new Error('Analytics client not initialized')
  }

  client.identify({
    distinctId: userId,
    properties,
  })
}
