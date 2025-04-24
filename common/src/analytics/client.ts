import { PostHog } from 'posthog-node'

// import { logger } from '../util/logger'
import { AnalyticsEvent } from './events'

// TODO: move this to env
const client = new PostHog('phc_tug7g8yc10qNestK14QV8WyKwjfEl6vwzIbJkBdqeHS', {
  host: 'https://us.i.posthog.com',
})

// Store the identified user ID
let currentUserId: string | undefined

export function flushAnalytics() {
  client.flush()
}

export function trackEvent(
  event: AnalyticsEvent,
  userId?: string,
  properties?: Record<string, any>
) {
  const distinctId = userId || currentUserId
  if (!distinctId) {
    // logger.error('Analytics event dropped due to missing user ID:', event)
    return
  }

  console.log('Analytics event tracked:', event, {
    distinctId,
    properties,
  })

  // if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
  //   // logger.info('Analytics event tracked:', event, {
  //   //   distinctId,
  //   //   properties,
  //   // })
  //   return
  // }

  client.capture({
    distinctId,
    event,
    properties,
  })
}

// To be used by `npm-app`, but not by `backend`
// Backend should pass in `userId` with each event instead.
export function identifyUser(userId: string, properties?: Record<string, any>) {
  // Store the user ID for future events
  currentUserId = userId

  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'production') {
    // logger.info('User identified:', userId, {
    //   properties,
    // })
    console.log('User identified:', userId, {
      properties,
    })
    return
  }

  client.identify({
    distinctId: userId,
    properties,
  })
}
