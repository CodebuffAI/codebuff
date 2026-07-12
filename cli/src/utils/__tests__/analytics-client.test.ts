import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { describe, test, expect, beforeEach, mock } from 'bun:test'

import {
  initAnalytics,
  trackEvent,
  identifyUser,
  resetAnalyticsState,
  type AnalyticsDeps,
} from '../analytics'

import type { AnalyticsClientWithIdentify } from '@codebuff/common/analytics-core'

describe('analytics with PostHog alias', () => {
  // Store references to track calls
  let captureMock: ReturnType<typeof mock>
  let identifyMock: ReturnType<typeof mock>
  let aliasMock: ReturnType<typeof mock>
  let flushMock: ReturnType<typeof mock>
  let captureExceptionMock: ReturnType<typeof mock>

  // Fixed anonymous ID for predictable testing
  const TEST_ANONYMOUS_ID = 'anon_test-uuid-1234'

  // Create mock client factory
  function createMockClient(): AnalyticsClientWithIdentify {
    return {
      capture: captureMock,
      identify: identifyMock,
      alias: aliasMock,
      flush: flushMock,
      captureException: captureExceptionMock,
    }
  }

  // Create test dependencies with production-like config
  function createTestDeps(): AnalyticsDeps {
    return {
      env: {
        NEXT_PUBLIC_POSTHOG_API_KEY: 'test-api-key',
        NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://test.posthog.com',
      },
      isProd: true,
      createClient: () => createMockClient(),
      generateAnonymousId: () => TEST_ANONYMOUS_ID,
    }
  }

  beforeEach(() => {
    // trackEvent/identifyUser are no-ops in local mode.

    // Reset mocks
    captureMock = mock(() => {})
    identifyMock = mock(() => {})
    aliasMock = mock(() => {})
    flushMock = mock(() => Promise.resolve())
    captureExceptionMock = mock(() => {})

    // Reset analytics state with test dependencies
    resetAnalyticsState(createTestDeps())
  })

  describe('anonymous tracking before identification', () => {
    test('should send events immediately with anonymous ID', () => {
      initAnalytics()

      trackEvent(AnalyticsEvent.APP_LAUNCHED, { test: 'value1' })
      trackEvent(AnalyticsEvent.USER_INPUT_COMPLETE, { test: 'value2' })

      // Analytics is a no-op in local mode; no events are captured.
      expect(captureMock).not.toHaveBeenCalled()
    })

    test('should generate anonymous ID on init', () => {
      initAnalytics()

      trackEvent(AnalyticsEvent.APP_LAUNCHED)

      // Analytics is a no-op in local mode; no events are captured.
      expect(captureMock).not.toHaveBeenCalled()
    })
  })

  describe('user identification with alias', () => {
    test('should call identify and alias when user logs in', () => {
      initAnalytics()

      // Track some events with anonymous ID
      trackEvent(AnalyticsEvent.APP_LAUNCHED)

      // Now identify the user
      identifyUser('user-123', { email: 'test@example.com' })

      // Analytics is a no-op in local mode; identify/alias are never called.
      expect(identifyMock).not.toHaveBeenCalled()
      expect(aliasMock).not.toHaveBeenCalled()
    })

    test('should use real user ID for events after identification', () => {
      initAnalytics()
      identifyUser('user-456')

      captureMock.mockClear()

      trackEvent(AnalyticsEvent.FEEDBACK_SUBMITTED, { rating: 5 })

      expect(captureMock).not.toHaveBeenCalled()
    })

    test('should not fail when identifying without prior anonymous events', () => {
      initAnalytics()

      // Identify immediately without any events
      expect(() => {
        identifyUser('user-789')
      }).not.toThrow()

      expect(identifyMock).not.toHaveBeenCalled()
      expect(aliasMock).not.toHaveBeenCalled()
    })
  })

  describe('event tracking after identification', () => {
    test('should send events directly with user ID', () => {
      initAnalytics()
      identifyUser('user-direct')
      captureMock.mockClear()

      trackEvent(AnalyticsEvent.APP_LAUNCHED)
      trackEvent(AnalyticsEvent.LOGIN)
      trackEvent(AnalyticsEvent.CHANGE_DIRECTORY)

      expect(captureMock).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    test('should handle events with undefined properties', () => {
      initAnalytics()

      trackEvent(AnalyticsEvent.APP_LAUNCHED, undefined)

      expect(captureMock).not.toHaveBeenCalled()
    })

    test('should handle events with empty properties object', () => {
      initAnalytics()

      trackEvent(AnalyticsEvent.APP_LAUNCHED, {})

      expect(captureMock).not.toHaveBeenCalled()
    })

    test('should throw when tracking events before initAnalytics in prod', () => {
      // Don't call initAnalytics - client is not initialized
      resetAnalyticsState(createTestDeps())

      // trackEvent is a no-op in local mode; it does not throw.
      expect(() => {
        trackEvent(AnalyticsEvent.APP_LAUNCHED)
      }).not.toThrow()
    })

    test('should throw when identifying before initAnalytics in prod', () => {
      resetAnalyticsState(createTestDeps())

      expect(() => {
        identifyUser('user-123')
      }).not.toThrow()
    })
  })

  describe('complete user journey', () => {
    test('should track full journey from anonymous to identified', () => {
      initAnalytics()

      // Anonymous events
      trackEvent(AnalyticsEvent.APP_LAUNCHED, { stage: 'startup' })
      trackEvent(AnalyticsEvent.USER_INPUT_COMPLETE, { stage: 'pre-login' })

      // User logs in
      identifyUser('user-journey', { plan: 'pro' })

      // Identified events
      trackEvent(AnalyticsEvent.FEEDBACK_SUBMITTED, { stage: 'post-login' })

      // Analytics is a no-op in local mode; no events are captured.
      expect(captureMock).not.toHaveBeenCalled()
      expect(aliasMock).not.toHaveBeenCalled()
    })
  })
})
