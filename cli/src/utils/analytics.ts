import { env } from '@codebuff/common/env'
import { PostHog } from 'posthog-node'

import type { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

// Prints the events to console
// It's very noisy, so recommended you set this to true
// only when you're actively adding new analytics
let DEBUG_DEV_EVENTS = false

// Store the identified user ID
let currentUserId: string | undefined
let client: PostHog | undefined

export let identified: boolean = false

export function initAnalytics() {
  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST_URL) {
    throw new Error(
      'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_HOST_URL is not set',
    )
  }

  client = new PostHog(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
    host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
    enableExceptionAutocapture: env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod',
  })
}

export async function flushAnalytics() {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {
    // Silently handle PostHog network errors - don't log to console or logger
    // This prevents PostHog errors from cluttering the user's console
  }
}

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, any>,
) {
  const distinctId = currentUserId
  if (!distinctId) {
    return
  }
  if (!client) {
    if (env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod') {
      throw new Error('Analytics client not initialized')
    }
    return
  }

  if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
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

  if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
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

export function logError(
  error: any,
  userId?: string,
  properties?: Record<string, any>,
) {
  if (!client) {
    return
  }

  try {
    client.captureException(
      error,
      userId ?? currentUserId ?? 'unknown',
      properties,
    )
  } catch (postHogError) {
    // Silently handle PostHog errors - don't log them to console
    // This prevents PostHog connection issues from cluttering the user's console
  }
}
