import { describe, test, expect, beforeEach, mock } from 'bun:test'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import type { AnalyticsClient } from '../analytics-core'

import {
  initAnalytics,
  trackEvent,
  flushAnalytics,
  configureAnalytics,
  resetServerAnalyticsState,
  getAnalyticsConfig,
  type ServerAnalyticsDeps,
} from '../analytics'

import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('server-side analytics', () => {
  let captureMock: ReturnType<typeof mock>
  let flushMock: ReturnType<typeof mock>
  let mockLogger: Logger

  function createMockClient(): AnalyticsClient {
    return {
      capture: captureMock,
      flush: flushMock,
    }
  }

  function createTestDeps(): ServerAnalyticsDeps {
    return {
      createClient: () => createMockClient(),
    }
  }

  beforeEach(() => {
    captureMock = mock(() => {})
    flushMock = mock(() => Promise.resolve())
    mockLogger = {
      info: mock(() => {}),
      debug: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }

    // Reset analytics state with test dependencies
    resetServerAnalyticsState(createTestDeps())
  })

  describe('initAnalytics', () => {
    test('should configure analytics from clientEnv', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      const config = getAnalyticsConfig()
      expect(config).not.toBeNull()
      expect(config?.envName).toBe('prod')
      expect(config?.posthogApiKey).toBe('test-key')
      expect(config?.posthogHostUrl).toBe('https://posthog.test')
    })

    test('should not create client in non-prod environments', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'dev',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      // Track an event - should not call capture since not prod
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-123',
        logger: mockLogger,
      })

      expect(captureMock).not.toHaveBeenCalled()
    })

    test('should create client in prod environment', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      // Track an event - should call capture since prod
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-123',
        logger: mockLogger,
      })

      expect(captureMock).toHaveBeenCalledTimes(1)
    })

    test('should set config to null if env vars are missing', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: '', // Missing
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      const config = getAnalyticsConfig()
      expect(config).toBeNull()
    })
  })

  describe('trackEvent', () => {
    test('should send events with correct parameters in prod', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      trackEvent({
        event: AnalyticsEvent.AGENT_STEP,
        userId: 'user-456',
        properties: { step: 1, duration: 100 },
        logger: mockLogger,
      })

      expect(captureMock).toHaveBeenCalledWith({
        distinctId: 'user-456',
        event: AnalyticsEvent.AGENT_STEP,
        properties: { step: 1, duration: 100 },
      })
    })

    test('should warn when client is not initialized', () => {
      // Configure as prod but don't initialize properly
      configureAnalytics({
        envName: 'prod',
        posthogApiKey: 'test-key',
        posthogHostUrl: 'https://posthog.test',
      })

      // Reset to clear the client but keep config
      resetServerAnalyticsState(createTestDeps())
      configureAnalytics({
        envName: 'prod',
        posthogApiKey: 'test-key',
        posthogHostUrl: 'https://posthog.test',
      })

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-789',
        logger: mockLogger,
      })

      expect(mockLogger.warn).toHaveBeenCalled()
      expect(captureMock).not.toHaveBeenCalled()
    })

    test('should silently skip events in non-prod environments', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-123',
        logger: mockLogger,
      })

      expect(captureMock).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    test('should handle capture errors gracefully', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      // Make capture throw an error
      captureMock.mockImplementation(() => {
        throw new Error('Network error')
      })

      // Should not throw
      expect(() => {
        trackEvent({
          event: AnalyticsEvent.APP_LAUNCHED,
          userId: 'user-123',
          logger: mockLogger,
        })
      }).not.toThrow()

      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('flushAnalytics', () => {
    test('should call client flush in prod', async () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      await flushAnalytics(mockLogger)

      expect(flushMock).toHaveBeenCalled()
    })

    test('should not throw when client is not initialized', async () => {
      // Don't initialize, just call flush
      await expect(flushAnalytics(mockLogger)).resolves.toBeUndefined()
    })

    test('should log errors but not throw on flush failure', async () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      flushMock.mockImplementation(() => {
        throw new Error('Flush failed')
      })

      await expect(flushAnalytics(mockLogger)).resolves.toBeUndefined()
      expect(mockLogger.warn).toHaveBeenCalled()
    })
  })

  describe('configureAnalytics', () => {
    test('should allow manual configuration', () => {
      configureAnalytics({
        envName: 'prod',
        posthogApiKey: 'manual-key',
        posthogHostUrl: 'https://manual.posthog.test',
      })

      const config = getAnalyticsConfig()
      expect(config?.envName).toBe('prod')
      expect(config?.posthogApiKey).toBe('manual-key')
    })

    test('should allow clearing configuration', () => {
      configureAnalytics({
        envName: 'prod',
        posthogApiKey: 'test-key',
        posthogHostUrl: 'https://posthog.test',
      })

      configureAnalytics(null)

      const config = getAnalyticsConfig()
      expect(config).toBeNull()
    })
  })

  describe('edge cases', () => {
    test('should handle events with undefined properties', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-123',
        properties: undefined,
        logger: mockLogger,
      })

      expect(captureMock).toHaveBeenCalledWith({
        distinctId: 'user-123',
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: undefined,
      })
    })

    test('should handle events with empty properties', () => {
      initAnalytics({
        logger: mockLogger,
        clientEnv: {
          NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
          NEXT_PUBLIC_POSTHOG_API_KEY: 'test-key',
          NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://posthog.test',
        },
      })

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-123',
        properties: {},
        logger: mockLogger,
      })

      expect(captureMock).toHaveBeenCalledWith({
        distinctId: 'user-123',
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: {},
      })
    })
  })
})
