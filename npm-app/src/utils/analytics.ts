import { AnalyticsEvent } from 'common/constants/analytics-events'
import { PostHog } from 'posthog-node'

import { logger } from './logger'

// Prints the events to console
// It's very noisy, so recommended you set this to true
// only when you're actively adding new analytics
let DEBUG_DEV_EVENTS = false

// Store the identified user ID
let currentUserId: string | undefined
let client: PostHog | undefined

export let identified: boolean = false

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
    enableExceptionAutocapture:
      process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'production',
  })
}
export async function flushAnalytics() {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {
    // Silently handle PostHog network errors
    if (DEBUG_DEV_EVENTS) {
      console.error('PostHog error:', error)
    }
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'PostHog error'
    )
  }
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
    if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'production') {
      throw new Error('Analytics client not initialized')
    }
    return
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

export function logError(
  error: any,
  userId?: string,
  properties?: Record<string, any>
) {
  if (!client) {
    logger.info('Skipping error logging: Analytics client not initialized')
    return
  }

  client.captureException(
    error,
    userId ?? currentUserId ?? 'unknown',
    properties
  )
}
