import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  EngagementTracker,
  createEngagementSessionId,
} from '@codebuff/common/util/engagement-tracker'

import { subscribeToActivity } from './activity-tracker'
import { trackEvent } from './analytics'

/**
 * CLI engaged-time heartbeat. Reuses the existing activity-tracker (keystrokes,
 * mouse movement, prompt submits already call `reportActivity()`) as the
 * presence signal, and emits one `PRODUCT_ACTIVE_MINUTE` per active minute with
 * `surface: 'cli'`. There is no tab/visibility concept in a terminal, so the
 * surface is always "present"; idleness alone gates the count.
 */

let tracker: EngagementTracker | undefined
let unsubscribeActivity: (() => void) | undefined

export function startEngagementTracking(): void {
  if (tracker) {
    return
  }

  const sessionId = createEngagementSessionId()

  tracker = new EngagementTracker({
    emit: () =>
      trackEvent(AnalyticsEvent.PRODUCT_ACTIVE_MINUTE, {
        surface: 'cli',
        engagement_session_id: sessionId,
      }),
    // Unref the timer so the heartbeat never keeps the process alive on exit.
    scheduler: {
      setInterval: (fn: () => void, ms: number) => {
        const t = setInterval(fn, ms)
        t.unref?.()
        return t
      },
      clearInterval: (t: unknown) =>
        clearInterval(t as ReturnType<typeof setInterval>),
    },
  })

  unsubscribeActivity = subscribeToActivity(() => tracker?.recordActivity())
  tracker.start()
}

export function stopEngagementTracking(): void {
  unsubscribeActivity?.()
  unsubscribeActivity = undefined
  tracker?.stop()
  tracker = undefined
}
