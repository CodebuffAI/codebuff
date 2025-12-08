import { env } from '@codebuff/common/env'
import { PostHog } from 'posthog-node'

import type { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

export enum AnalyticsErrorStage {
  Init = 'init',
  Track = 'track',
  Identify = 'identify',
  Flush = 'flush',
  CaptureException = 'captureException',
}

type AnalyticsErrorContext = {
  stage: AnalyticsErrorStage
} & Record<string, unknown>

type AnalyticsErrorLogger = (
  error: unknown,
  context: AnalyticsErrorContext,
) => void

// Prints the events to console
// It's very noisy, so recommended you set this to true
// only when you're actively adding new analytics
let DEBUG_DEV_EVENTS = false

// Store the identified user ID
let currentUserId: string | undefined
let client: PostHog | undefined

export let identified: boolean = false
let analyticsErrorLogger: AnalyticsErrorLogger | undefined

export function setAnalyticsErrorLogger(loggerFn: AnalyticsErrorLogger) {
  analyticsErrorLogger = loggerFn
}

function logAnalyticsError(error: unknown, context: AnalyticsErrorContext) {
  try {
    analyticsErrorLogger?.(error, context)
  } catch {
    // Never throw from error reporting
  }
}

export function initAnalytics() {
  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST_URL) {
    const error = new Error(
      'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_HOST_URL is not set',
    )
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Init,
      missingEnv: true,
    })
    throw error
  }

  try {
    client = new PostHog(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
      host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
      enableExceptionAutocapture: env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod',
    })
  } catch (error) {
    logAnalyticsError(error, { stage: AnalyticsErrorStage.Init })
    throw error
  }
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
    logAnalyticsError(error, { stage: AnalyticsErrorStage.Flush })
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
      const error = new Error('Analytics client not initialized')
      logAnalyticsError(error, {
        stage: AnalyticsErrorStage.Track,
        event,
        properties,
      })
      throw error
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

  try {
    client.capture({
      distinctId,
      event,
      properties,
    })
  } catch (error) {
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Track,
      event,
      properties,
    })
  }
}

export function identifyUser(userId: string, properties?: Record<string, any>) {
  // Store the user ID for future events
  currentUserId = userId

  if (!client) {
    const error = new Error('Analytics client not initialized')
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Identify,
      properties,
    })
    throw error
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

  try {
    client.identify({
      distinctId: userId,
      properties,
    })
  } catch (error) {
    logAnalyticsError(error, {
      stage: AnalyticsErrorStage.Identify,
      properties,
    })
  }
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
    logAnalyticsError(postHogError, {
      stage: AnalyticsErrorStage.CaptureException,
      properties,
    })
  }
}
