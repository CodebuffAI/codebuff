import { env } from '@/env'
import { PostHog } from 'posthog-node'

import { AnalyticsEvent } from 'common/src/constants/analytics-events'

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
    flushAt: 1,
    flushInterval: 0,
  })
}

export async function flushAnalytics() {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {}
}

export function trackEvent(
  event: AnalyticsEvent,
  userId: string,
  properties?: Record<string, any>
) {
  if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
    logger.info({ payload: { event, properties } }, 'Analytics event tracked')
    return
  }

  if (!client) {
    throw new Error('Analytics client not initialized')
  }

  try {
    client.capture({
      distinctId: userId,
      event,
      properties,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to track event')
  }
}

export function logError(
  error: Error,
  userId?: string,
  properties?: Record<string, any>
) {
  if (!client) {
    throw new Error('Analytics client not initialized')
  }

  try {
    client.captureException(error, userId ?? 'unknown', properties)
  } catch (error) {
    logger.error({ error }, 'Failed to log error')
  }
}
