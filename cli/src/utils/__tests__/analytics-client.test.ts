import { describe, test, expect, beforeEach, mock } from 'bun:test'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import type { AnalyticsClientWithIdentify } from '@codebuff/common/analytics'

import {
  initAnalytics,
  trackEvent,
  identifyUser,
  resetAnalyticsState,
  type AnalyticsDeps,
} from '../analytics'

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

      // Events should be sent immediately with anonymous ID
      expect(captureMock).toHaveBeenCalledTimes(2)
      expect(captureMock).toHaveBeenCalledWith({
        distinctId: TEST_ANONYMOUS_ID,
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: { test: 'value1' },
      })
      expect(captureMock).toHaveBeenCalledWith({
        distinctId: TEST_ANONYMOUS_ID,
        event: AnalyticsEvent.USER_INPUT_COMPLETE,
        properties: { test: 'value2' },
      })
    })

    test('should generate anonymous ID on init', () => {
      initAnalytics()

      trackEvent(AnalyticsEvent.APP_LAUNCHED)

      // Verify the anonymous ID is used
      expect(captureMock).toHaveBeenCalledWith({
        distinctId: TEST_ANONYMOUS_ID,
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: undefined,
      })
    })
  })

  describe('user identification with alias', () => {
    test('should call identify and alias when user logs in', () => {
      initAnalytics()

      // Track some events with anonymous ID
      trackEvent(AnalyticsEvent.APP_LAUNCHED)

      // Now identify the user
      identifyUser('user-123', { email: 'test@example.com' })

      // Should call identify with user ID
      expect(identifyMock).toHaveBeenCalledWith({
        distinctId: 'user-123',
        properties: { email: 'test@example.com' },
      })

      // Should call alias to link anonymous ID to user ID
      expect(aliasMock).toHaveBeenCalledWith({
        distinctId: 'user-123',
        alias: TEST_ANONYMOUS_ID,
      })
    })

    test('should use real user ID for events after identification', () => {
      initAnalytics()
      identifyUser('user-456')

      captureMock.mockClear()

      trackEvent(AnalyticsEvent.FEEDBACK_SUBMITTED, { rating: 5 })

      expect(captureMock).toHaveBeenCalledWith({
        distinctId: 'user-456',
        event: AnalyticsEvent.FEEDBACK_SUBMITTED,
        properties: { rating: 5 },
      })
    })

    test('should not fail when identifying without prior anonymous events', () => {
      initAnalytics()

      // Identify immediately without any events
      expect(() => {
        identifyUser('user-789')
      }).not.toThrow()

      expect(identifyMock).toHaveBeenCalledTimes(1)
      expect(aliasMock).toHaveBeenCalledTimes(1)
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

      expect(captureMock).toHaveBeenCalledTimes(3)

      // All events should use the real user ID
      const calls = captureMock.mock.calls
      expect((calls[0][0] as { distinctId: string }).distinctId).toBe(
        'user-direct',
      )
      expect((calls[1][0] as { distinctId: string }).distinctId).toBe(
        'user-direct',
      )
      expect((calls[2][0] as { distinctId: string }).distinctId).toBe(
        'user-direct',
      )
    })
  })

  describe('edge cases', () => {
    test('should handle events with undefined properties', () => {
      initAnalytics()

      trackEvent(AnalyticsEvent.APP_LAUNCHED, undefined)

      expect(captureMock).toHaveBeenCalledWith({
        distinctId: TEST_ANONYMOUS_ID,
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: undefined,
      })
    })

    test('should handle events with empty properties object', () => {
      initAnalytics()

      trackEvent(AnalyticsEvent.APP_LAUNCHED, {})

      expect(captureMock).toHaveBeenCalledWith({
        distinctId: TEST_ANONYMOUS_ID,
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: {},
      })
    })

    test('should throw when tracking events before initAnalytics in prod', () => {
      // Don't call initAnalytics - client is not initialized
      resetAnalyticsState(createTestDeps())

      // In prod mode, this should throw since client is not initialized
      expect(() => {
        trackEvent(AnalyticsEvent.APP_LAUNCHED)
      }).toThrow('Analytics client not initialized')
    })

    test('should throw when identifying before initAnalytics in prod', () => {
      resetAnalyticsState(createTestDeps())

      expect(() => {
        identifyUser('user-123')
      }).toThrow('Analytics client not initialized')
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

      // Verify the full sequence
      expect(captureMock).toHaveBeenCalledTimes(3)

      // First two events with anonymous ID
      expect(captureMock).toHaveBeenNthCalledWith(1, {
        distinctId: TEST_ANONYMOUS_ID,
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: { stage: 'startup' },
      })
      expect(captureMock).toHaveBeenNthCalledWith(2, {
        distinctId: TEST_ANONYMOUS_ID,
        event: AnalyticsEvent.USER_INPUT_COMPLETE,
        properties: { stage: 'pre-login' },
      })

      // Third event with real user ID
      expect(captureMock).toHaveBeenNthCalledWith(3, {
        distinctId: 'user-journey',
        event: AnalyticsEvent.FEEDBACK_SUBMITTED,
        properties: { stage: 'post-login' },
      })

      // Alias was called to merge anonymous session into user profile
      expect(aliasMock).toHaveBeenCalledWith({
        distinctId: 'user-journey',
        alias: TEST_ANONYMOUS_ID,
      })
    })
  })
})
