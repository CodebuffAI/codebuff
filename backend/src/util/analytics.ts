import { AnalyticsEvent } from 'common/src/constants/analytics-events'
import { PostHog } from 'posthog-node'

import { logger } from './logger'

import { env } from '@/env.mjs'

let client: PostHog | undefined

export function initAnalytics() {
  try {
    logger.info('Starting analytics initialization...')

    if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !env.NEXT_PUBLIC_POSTHOG_HOST_URL) {
      throw new Error(
        'NEXT_PUBLIC_POSTHOG_API_KEY or NEXT_PUBLIC_POSTHOG_HOST_URL is not set'
      )
    }

    logger.info('Creating PostHog client...')
    client = new PostHog(env.NEXT_PUBLIC_POSTHOG_API_KEY, {
      host: env.NEXT_PUBLIC_POSTHOG_HOST_URL,
    })
    logger.info('PostHog client created successfully')
  } catch (error) {
    logger.error(
      {
        error,
        stack: (error as Error).stack,
        message: (error as Error).message,
        name: (error as Error).name,
        code: (error as any).code,
        details: (error as any).details,
      },
      'Failed to initialize analytics'
    )
    throw error
  }
}

export function flushAnalytics() {
  if (!client) {
    return
  }
  try {
    logger.info('Flushing analytics...')
    client.flush()
    logger.info('Analytics flushed successfully')
  } catch (error) {
    logger.error(
      {
        error,
        stack: (error as Error).stack,
        message: (error as Error).message,
      },
      'Failed to flush analytics'
    )
  }
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

  try {
    client.capture({
      distinctId: userId,
      event,
      properties,
    })
  } catch (error) {
    logger.error(
      {
        error,
        stack: (error as Error).stack,
        message: (error as Error).message,
        event,
        userId,
      },
      'Failed to track analytics event'
    )
  }
}
