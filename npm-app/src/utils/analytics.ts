import { AnalyticsEvent } from 'common/constants/analytics-events'
import { PostHog } from 'posthog-node'

// Prints the events to console
// It's very noisy, so recommended you set this to true
// only when you're actively adding new analytics
let DEBUG_DEV_EVENTS = true

// Store the identified user ID
let currentUserId: string | undefined
let client: PostHog | undefined

export let identified: boolean = false

export function initAnalytics() {
  if (
    !process.env.NEXT_PUBLIC_POSTHOG_API_KEY ||
    !process.env.NEXT_PUBLIC_APP_URL
  ) {
    throw new Error(
      'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_APP_URL is not set'
    )
  }

  client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_API_KEY, {
    host: `${process.env.NEXT_PUBLIC_APP_URL}/ingest`,
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
  properties?: Record<string, any>
) {
  const distinctId = currentUserId
  if (!distinctId) {
    return
  }
  if (!client) {
    throw new Error('Analytics client not initialized')
  }

  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    if (DEBUG_DEV_EVENTS) {
      console.log('Analytics event sent', {
        event,
        properties,
      })
    }
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

  if (!client) {
    throw new Error('Analytics client not initialized')
  }

  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    if (DEBUG_DEV_EVENTS) {
      console.log('Identify event sent', {
        userId,
        properties,
      })
    }
    return
  }

  client.identify({
    distinctId: userId,
    properties,
  })
}
