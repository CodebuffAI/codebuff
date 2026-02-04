/**
 * Typed analytics mock factory for testing.
 *
 * Provides type-safe mocks for analytics functions used throughout the codebase.
 * Helps avoid the need for `as any` casts when mocking analytics in tests.
 *
 * @example
 * ```typescript
 * import { createMockAnalytics, setupAnalyticsMocks } from '@codebuff/common/testing/mocks/analytics'
 *
 * // Option 1: Create mock object
 * const analytics = createMockAnalytics()
 * someFunction({ trackEvent: analytics.trackEvent })
 *
 * // Option 2: Setup spies on actual module
 * const spies = setupAnalyticsMocks()
 * await runTest()
 * expect(spies.trackEvent).toHaveBeenCalledWith('event_name', { prop: 'value' })
 * spies.restore()
 * ```
 */

import { mock, spyOn } from 'bun:test'

import type { Mock } from 'bun:test'

/**
 * Properties that can be tracked with an event.
 */
export type EventProperties = Record<string, unknown>

/**
 * Signature for the trackEvent function.
 */
export type TrackEventFn = (
  eventName: string,
  properties?: EventProperties,
) => void

/**
 * Signature for the flushAnalytics function.
 */
export type FlushAnalyticsFn = () => Promise<void>

/**
 * Signature for the identifyUser function.
 */
export type IdentifyUserFn = (
  userId: string,
  traits?: Record<string, unknown>,
) => void

/**
 * Interface for the complete mock analytics object.
 */
export interface MockAnalytics {
  /** Track a named event with optional properties */
  trackEvent: Mock<TrackEventFn>
  /** Flush pending analytics events */
  flushAnalytics: Mock<FlushAnalyticsFn>
  /** Identify a user with optional traits */
  identifyUser: Mock<IdentifyUserFn>
}

/**
 * Tracked event entry for inspection.
 */
export interface TrackedEvent {
  name: string
  properties?: EventProperties
  timestamp: Date
}

/**
 * Options for creating mock analytics.
 */
export interface CreateMockAnalyticsOptions {
  /**
   * Whether to capture tracked events for later inspection.
   * @default false
   */
  captureEvents?: boolean
}

/**
 * Creates a type-safe mock analytics object for testing.
 *
 * @param options - Configuration options
 * @returns A mock analytics object with all methods as tracked mocks
 *
 * @example
 * ```typescript
 * const analytics = createMockAnalytics()
 *
 * // Pass to function under test
 * await processPayment({ analytics })
 *
 * // Verify events were tracked
 * expect(analytics.trackEvent).toHaveBeenCalledWith('payment_processed', {
 *   amount: 100,
 *   currency: 'USD',
 * })
 * ```
 */
export function createMockAnalytics(
  options: CreateMockAnalyticsOptions = {},
): MockAnalytics {
  return {
    trackEvent: mock(() => {}),
    flushAnalytics: mock(async () => {}),
    identifyUser: mock(() => {}),
  }
}

/**
 * Result of creating mock analytics with event capture.
 */
export interface MockAnalyticsWithCapture {
  /** The mock analytics object */
  analytics: MockAnalytics
  /** Array of all tracked events */
  events: TrackedEvent[]
  /** Clear all captured events */
  clearEvents: () => void
  /** Get events by name */
  getEventsByName: (name: string) => TrackedEvent[]
  /** Check if an event was tracked */
  hasEvent: (name: string) => boolean
  /** Get the last event tracked */
  getLastEvent: () => TrackedEvent | undefined
}

/**
 * Creates mock analytics that captures all tracked events for inspection.
 *
 * @returns An object containing the analytics mock and utilities for inspection
 *
 * @example
 * ```typescript
 * const { analytics, events, getEventsByName } = createMockAnalyticsWithCapture()
 *
 * await runUserFlow({ analytics })
 *
 * // Check events were tracked in order
 * expect(events.map(e => e.name)).toEqual([
 *   'flow_started',
 *   'step_completed',
 *   'flow_finished',
 * ])
 *
 * // Check specific event properties
 * const completionEvents = getEventsByName('step_completed')
 * expect(completionEvents[0].properties).toMatchObject({ stepId: 'step1' })
 * ```
 */
export function createMockAnalyticsWithCapture(): MockAnalyticsWithCapture {
  const events: TrackedEvent[] = []

  const analytics: MockAnalytics = {
    trackEvent: mock((name: string, properties?: EventProperties) => {
      events.push({
        name,
        properties,
        timestamp: new Date(),
      })
    }),
    flushAnalytics: mock(async () => {}),
    identifyUser: mock(() => {}),
  }

  return {
    analytics,
    events,
    clearEvents: () => {
      events.length = 0
    },
    getEventsByName: (name: string) => events.filter((e) => e.name === name),
    hasEvent: (name: string) => events.some((e) => e.name === name),
    getLastEvent: () => events[events.length - 1],
  }
}

/**
 * Result of setting up analytics spies on the actual module.
 */
export interface AnalyticsSpies {
  /** Spy on trackEvent */
  trackEvent: ReturnType<typeof spyOn>
  /** Spy on flushAnalytics */
  flushAnalytics: ReturnType<typeof spyOn>
  /** Restore all spies */
  restore: () => void
  /** Clear all spy call history */
  clear: () => void
}

/**
 * Sets up spies on the analytics module.
 * Use this when you need to spy on the actual module rather than inject a mock.
 *
 * @param analyticsModule - The analytics module to spy on
 * @returns Object containing the spies and cleanup utilities
 *
 * @example
 * ```typescript
 * import * as analytics from '@codebuff/common/analytics'
 *
 * describe('my test', () => {
 *   let analyticsSpy: AnalyticsSpies
 *
 *   beforeEach(() => {
 *     analyticsSpy = setupAnalyticsMocks(analytics)
 *   })
 *
 *   afterEach(() => {
 *     analyticsSpy.restore()
 *   })
 *
 *   it('tracks the event', async () => {
 *     await doSomething()
 *     expect(analyticsSpy.trackEvent).toHaveBeenCalledWith('something_done')
 *   })
 * })
 * ```
 */
export function setupAnalyticsMocks(analyticsModule: {
  trackEvent: TrackEventFn
  flushAnalytics: FlushAnalyticsFn
}): AnalyticsSpies {
  const trackEventSpy = spyOn(analyticsModule, 'trackEvent').mockImplementation(
    () => {},
  )
  const flushAnalyticsSpy = spyOn(
    analyticsModule,
    'flushAnalytics',
  ).mockImplementation(async () => {})

  return {
    trackEvent: trackEventSpy,
    flushAnalytics: flushAnalyticsSpy,
    restore: () => {
      trackEventSpy.mockRestore()
      flushAnalyticsSpy.mockRestore()
    },
    clear: () => {
      trackEventSpy.mockClear()
      flushAnalyticsSpy.mockClear()
    },
  }
}

/**
 * Restores all mock methods on an analytics object.
 *
 * @param analytics - The mock analytics to restore
 */
export function restoreMockAnalytics(analytics: MockAnalytics): void {
  analytics.trackEvent.mockRestore()
  analytics.flushAnalytics.mockRestore()
  analytics.identifyUser.mockRestore()
}
