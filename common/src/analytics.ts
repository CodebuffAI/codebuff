import { env } from '@codebuff/internal'
import { PostHog } from 'posthog-node'

import { logger } from './util/logger'

import type { AnalyticsEvent } from './constants/analytics-events'
import type { Logger } from '@codebuff/types/logger'

let client: PostHog | undefined

export function initAnalytics({ logger }: { logger: Logger }) {
  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST_URL) {
    logger.warn(
      'Analytics environment variables not set - analytics will be disabled',
    )
    return
  }

  try {
    client = new PostHog(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
      host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
      flushAt: 1,
      flushInterval: 0,
    })
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize analytics client')
  }
}

export async function flushAnalytics() {
  if (!client) {
    return
  }
  try {
    await client.flush()
  } catch (error) {}
}

export function trackEvent({
  event,
  userId,
  properties,
  logger,
}: {
  event: AnalyticsEvent
  userId: string
  properties?: Record<string, any>
  logger: Logger
}) {
  if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
    logger.info({ payload: { event, properties } }, 'Analytics event tracked')
    return
  }

  if (!client) {
    logger.warn(
      { event, userId },
      'Analytics client not initialized, skipping event tracking',
    )
    return
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
  properties?: Record<string, any>,
) {
  if (!client) {
    logger.warn(
      { error: error.message, userId },
      'Analytics client not initialized, skipping error logging',
    )
    return
  }

  try {
    client.captureException(error, userId ?? 'unknown', properties)
  } catch (error) {
    logger.error({ error }, 'Failed to log error')
  }
}
