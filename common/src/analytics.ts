import { PostHog } from 'posthog-node'

import type { AnalyticsEvent } from './constants/analytics-events'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ClientEnv } from './env-schema'

let client: PostHog | undefined

type EnvName = 'dev' | 'test' | 'prod'

type AnalyticsConfig = {
  envName: EnvName
  posthogApiKey: string
  posthogHostUrl: string
}

let analyticsConfig: AnalyticsConfig | null = null

export const configureAnalytics = (config: AnalyticsConfig | null) => {
  analyticsConfig = config
  client = undefined
}

const getConfigFromClientEnv = (
  clientEnv: Pick<
    ClientEnv,
    | 'NEXT_PUBLIC_CB_ENVIRONMENT'
    | 'NEXT_PUBLIC_POSTHOG_API_KEY'
    | 'NEXT_PUBLIC_POSTHOG_HOST_URL'
  >,
): AnalyticsConfig | null => {
  const envName = clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT
  const posthogApiKey = clientEnv.NEXT_PUBLIC_POSTHOG_API_KEY
  const posthogHostUrl = clientEnv.NEXT_PUBLIC_POSTHOG_HOST_URL

  if (!envName) return null
  if (!posthogApiKey || !posthogHostUrl) return null

  return { envName, posthogApiKey, posthogHostUrl }
}

export function initAnalytics({
  logger,
  clientEnv,
}: {
  logger: Logger
  clientEnv?: Parameters<typeof getConfigFromClientEnv>[0]
}) {
  if (clientEnv) {
    configureAnalytics(getConfigFromClientEnv(clientEnv))
  }

  if (analyticsConfig?.envName !== 'prod') {
    return
  }

  if (!analyticsConfig) {
    return
  }

  try {
    client = new PostHog(analyticsConfig.posthogApiKey, {
      host: analyticsConfig.posthogHostUrl,
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
  } catch {}
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
  if (analyticsConfig?.envName !== 'prod') {
    // Note (James): This log was too noisy. Reenable it as you need to test something.
    // logger.info({ payload: { event, properties } }, event)
    return
  }

  if (!client) {
    initAnalytics({ logger })
    if (!client) {
      logger.warn(
        { event, userId },
        'Analytics client not initialized, skipping event tracking',
      )
      return
    }
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
