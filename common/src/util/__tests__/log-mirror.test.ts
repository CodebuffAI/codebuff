import { describe, expect, it } from 'bun:test'

import {
  AXIOM_MIRROR_DENYLIST,
  shouldMirrorAnalyticsEvent,
} from '../log-mirror'

describe('shouldMirrorAnalyticsEvent', () => {
  it('drops high-volume PostHog auto-events from the Axiom mirror', () => {
    for (const denied of AXIOM_MIRROR_DENYLIST) {
      expect(shouldMirrorAnalyticsEvent(denied)).toBe(false)
    }
    expect(shouldMirrorAnalyticsEvent('$snapshot')).toBe(false)
    expect(shouldMirrorAnalyticsEvent('$autocapture')).toBe(false)
  })

  it('keeps named product events and useful $ events', () => {
    expect(shouldMirrorAnalyticsEvent('cli.login')).toBe(true)
    expect(shouldMirrorAnalyticsEvent('cli.app_launched')).toBe(true)
    expect(shouldMirrorAnalyticsEvent('web.signup')).toBe(true)
    expect(shouldMirrorAnalyticsEvent('$pageview')).toBe(true)
    expect(shouldMirrorAnalyticsEvent('$identify')).toBe(true)
    expect(shouldMirrorAnalyticsEvent('$exception')).toBe(true)
  })

  it('treats empty/null event names as mirror-eligible (logs without an event)', () => {
    expect(shouldMirrorAnalyticsEvent(null)).toBe(true)
    expect(shouldMirrorAnalyticsEvent(undefined)).toBe(true)
    expect(shouldMirrorAnalyticsEvent('')).toBe(true)
  })
})
