import { describe, expect, it } from 'bun:test'

import {
  EngagementTracker,
  ENGAGEMENT_INTERVAL_MS,
  ENGAGEMENT_IDLE_THRESHOLD_MS,
  type EngagementScheduler,
} from '../engagement-tracker'

/** A scheduler whose registered tick can be fired manually, with a movable clock. */
function harness(opts?: { idleThresholdMs?: number }) {
  let now = 1_000_000
  let registered: (() => void) | undefined
  let cleared = false
  let emits = 0

  const scheduler: EngagementScheduler = {
    setInterval: (fn) => {
      registered = fn
      return 'handle'
    },
    clearInterval: () => {
      cleared = true
    },
  }

  const tracker = new EngagementTracker({
    emit: () => emits++,
    now: () => now,
    scheduler,
    idleThresholdMs: opts?.idleThresholdMs,
  })

  return {
    tracker,
    advance: (ms: number) => {
      now += ms
    },
    fireTick: () => registered?.(),
    get emits() {
      return emits
    },
    get cleared() {
      return cleared
    },
    get started() {
      return registered !== undefined
    },
  }
}

describe('EngagementTracker', () => {
  it('emits one event per tick while visible and recently active', () => {
    const h = harness()
    h.tracker.start()

    h.fireTick()
    h.fireTick()
    expect(h.emits).toBe(2)
  })

  it('does not emit when the surface is not visible', () => {
    const h = harness()
    h.tracker.start()
    h.tracker.setVisible(false)

    h.fireTick()
    expect(h.emits).toBe(0)
  })

  it('stops emitting once the user is idle past the threshold', () => {
    const h = harness()
    h.tracker.start()

    h.advance(ENGAGEMENT_IDLE_THRESHOLD_MS - 1)
    h.fireTick()
    expect(h.emits).toBe(1)

    // Cross the idle threshold with no activity → no more counting.
    h.advance(2)
    h.fireTick()
    expect(h.emits).toBe(1)

    // Activity revives engagement.
    h.tracker.recordActivity()
    h.fireTick()
    expect(h.emits).toBe(2)
  })

  it('treats re-becoming visible as activity', () => {
    const h = harness()
    h.tracker.start()

    h.tracker.setVisible(false)
    h.advance(ENGAGEMENT_IDLE_THRESHOLD_MS + 10)
    // Returning to the surface counts as fresh activity, so the next tick counts.
    h.tracker.setVisible(true)
    h.fireTick()
    expect(h.emits).toBe(1)
  })

  it('start is idempotent and stop clears the timer', () => {
    const h = harness()
    h.tracker.start()
    h.tracker.start()
    expect(h.started).toBe(true)

    h.tracker.stop()
    expect(h.cleared).toBe(true)
  })

  it('defaults to a one-minute cadence', () => {
    expect(ENGAGEMENT_INTERVAL_MS).toBe(60_000)
  })
})
