'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  EngagementTracker as Tracker,
  createEngagementSessionId,
} from '@codebuff/common/util/engagement-tracker'
import { env } from '@codebuff/common/env'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'
import { useEffect } from 'react'

/**
 * Browser engaged-time heartbeat for the three web product surfaces. One
 * `PRODUCT_ACTIVE_MINUTE` per active minute while the tab is visible AND focused
 * and the user isn't idle. The `surface` is derived from the route prefix so the
 * same component serves all three:
 *
 *   /web   → web    /chat → chat    /cloud → cloud
 *
 * Marketing / landing routes are intentionally untracked (they aren't a
 * "product"); only the three app prefixes count.
 */
function surfaceForPath(pathname: string | null): string | null {
  if (!pathname) return null
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chat'
  if (pathname === '/cloud' || pathname.startsWith('/cloud/')) return 'cloud'
  if (pathname === '/web' || pathname.startsWith('/web/')) return 'web'
  return null
}

const ACTIVITY_EVENTS = [
  'pointermove',
  'pointerdown',
  'keydown',
  'scroll',
  'wheel',
  'touchstart',
] as const

export function EngagementTracker() {
  const pathname = usePathname()
  const surface = surfaceForPath(pathname)

  useEffect(() => {
    if (!surface || !env.NEXT_PUBLIC_POSTHOG_API_KEY) {
      return
    }

    const sessionId = createEngagementSessionId()
    const tracker = new Tracker({
      emit: () =>
        posthog.capture(AnalyticsEvent.PRODUCT_ACTIVE_MINUTE, {
          surface,
          engagement_session_id: sessionId,
        }),
    })

    const isPresent = () =>
      document.visibilityState === 'visible' && document.hasFocus()

    const onActivity = () => tracker.recordActivity()
    const onPresenceChange = () => tracker.setVisible(isPresent())

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', onPresenceChange)
    window.addEventListener('focus', onPresenceChange)
    window.addEventListener('blur', onPresenceChange)

    tracker.setVisible(isPresent())
    tracker.start()

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity)
      }
      document.removeEventListener('visibilitychange', onPresenceChange)
      window.removeEventListener('focus', onPresenceChange)
      window.removeEventListener('blur', onPresenceChange)
      tracker.stop()
    }
  }, [surface])

  return null
}
