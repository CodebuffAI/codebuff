import { env } from '../env.mjs'
import { logger } from '../util/logger'

// // Store the identified user ID
// let currentUserId: string | undefined

// // Use existing environment variables
// const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_API_KEY
// const POSTHOG_HOST_URL = process.env.NEXT_PUBLIC_POSTHOG_HOST_URL
// const POSTHOG_ENDPOINT = `${POSTHOG_HOST_URL}/i/v0/e/`

export async function identifyUser(
  userId: string,
  properties: Record<string, any> = {}
) {
  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !userId) return

  // currentUserId = userId

  const payload = {
    api_key: env.NEXT_PUBLIC_POSTHOG_API_KEY,
    event: '$identify',
    distinct_id: userId,
    properties: {
      $set: properties,
    },
  }

  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    logger.info({ userId, properties }, 'Identifying user in PostHog')
    return
  }

  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_POSTHOG_HOST_URL}/i/v0/e/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    return response.json()
  } catch (error) {
    logger.error({ error }, 'PostHog identify error')
  }
}

export async function trackEvent(
  eventName: string,
  userId?: string,
  properties: Record<string, any> = {}
) {
  if (!env.NEXT_PUBLIC_POSTHOG_API_KEY || !eventName) return

  if (!userId) {
    logger.error('No user ID provided for event capture')
    return
  }

  const payload = {
    api_key: env.NEXT_PUBLIC_POSTHOG_API_KEY,
    event: eventName,
    distinct_id: userId,
    properties: properties,
  }

  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    logger.info({ userId, eventName, properties }, 'Capturing event in PostHog')
    return
  }

  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_POSTHOG_HOST_URL}/i/v0/e/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    return response.json()
  } catch (error) {
    logger.error({ error }, 'PostHog event capture error')
  }
}
