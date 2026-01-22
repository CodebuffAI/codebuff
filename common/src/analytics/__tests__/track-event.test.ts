import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Mock the env module before importing track-event
const mockEnv = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'dev',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'test-api-key',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://test.posthog.com',
}

// Mock client
let mockClient: {
  capture: ReturnType<typeof mock>
  flush: ReturnType<typeof mock>
}

// Track if createPostHogClient was called and with what args
let createClientCalls: Array<{ apiKey: string; options: object }> = []

// We need to use require.cache manipulation to test module-level state
// Since track-event.ts has module-level `let client`, we need to reset it between tests
let trackEvent: typeof import('../track-event').trackEvent
let flushAnalytics: typeof import('../track-event').flushAnalytics
let resetAnalyticsClient: typeof import('../track-event').resetAnalyticsClient

function createMockLogger(): Logger {
  return {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    trace: mock(() => {}),
    fatal: mock(() => {}),
    child: mock(() => createMockLogger()),
    level: 'info',
    silent: mock(() => {}),
    isLevelEnabled: mock(() => true),
    bindings: mock(() => ({})),
    flush: mock(() => {}),
    pino: {} as any,
  } as unknown as Logger
}

describe('track-event', () => {
  beforeEach(async () => {
    // Reset mocks
    mockClient = {
      capture: mock(() => {}),
      flush: mock(() => Promise.resolve()),
    }
    createClientCalls = []
    mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'dev'

    // Clear the module cache to reset the module-level `client` variable
    const modulePath = require.resolve('../track-event')
    delete require.cache[modulePath]

    // Mock the dependencies before importing
    mock.module('../core', () => ({
      createPostHogClient: (apiKey: string, options: object) => {
        createClientCalls.push({ apiKey, options })
        return mockClient
      },
    }))

    mock.module('@codebuff/common/env', () => ({
      env: mockEnv,
      DEBUG_ANALYTICS: false,
    }))

    // Re-import to get fresh module with reset state
    const module = await import('../track-event')
    trackEvent = module.trackEvent
    flushAnalytics = module.flushAnalytics
    resetAnalyticsClient = module.resetAnalyticsClient

    // Reset the client state
    resetAnalyticsClient()
  })

  afterEach(() => {
    mock.restore()
  })

  describe('resetAnalyticsClient', () => {
    it('resets the client state', async () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      // Initialize the client
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })
      expect(createClientCalls).toHaveLength(1)

      // Reset the client
      resetAnalyticsClient()

      // Next trackEvent should create a new client
      trackEvent({
        event: AnalyticsEvent.AGENT_STEP,
        userId: 'user-2',
        logger,
      })
      expect(createClientCalls).toHaveLength(2)
    })

    it('allows flushAnalytics to be no-op after reset', async () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      // Initialize the client
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      // Reset the client
      resetAnalyticsClient()

      // Flush should be a no-op (no client)
      await flushAnalytics(logger)
      expect(mockClient.flush).not.toHaveBeenCalled()
    })
  })

  describe('trackEvent', () => {
    it('skips tracking in dev environment', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'dev'
      const logger = createMockLogger()

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        properties: { foo: 'bar' },
        logger,
      })

      // Should not create a client or capture in dev
      expect(createClientCalls).toHaveLength(0)
      expect(mockClient.capture).not.toHaveBeenCalled()
    })

    it('tracks events in prod environment', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        properties: { foo: 'bar' },
        logger,
      })

      // Should create client and capture
      expect(createClientCalls).toHaveLength(1)
      expect(createClientCalls[0].apiKey).toBe('test-api-key')
      expect(mockClient.capture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: { foo: 'bar' },
      })
    })

    it('lazily initializes client only once', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      // First call
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      // Second call
      trackEvent({
        event: AnalyticsEvent.AGENT_STEP,
        userId: 'user-1',
        logger,
      })

      // Client should only be created once
      expect(createClientCalls).toHaveLength(1)
      // But capture should be called twice
      expect(mockClient.capture).toHaveBeenCalledTimes(2)
    })

    it('logs initialization message on first call in prod', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      expect(logger.info).toHaveBeenCalledWith(
        { envName: 'prod' },
        'Analytics client initialized',
      )
    })

    it('handles capture errors gracefully', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()
      const captureError = new Error('Capture failed')
      mockClient.capture = mock(() => {
        throw captureError
      })

      // Should not throw
      expect(() =>
        trackEvent({
          event: AnalyticsEvent.APP_LAUNCHED,
          userId: 'user-1',
          logger,
        }),
      ).not.toThrow()

      expect(logger.error).toHaveBeenCalledWith(
        { error: captureError },
        'Failed to track event',
      )
    })

    it('handles client initialization errors gracefully', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()
      const initError = new Error('Init failed')

      // Reset and make createPostHogClient throw
      createClientCalls = []
      mock.module('../core', () => ({
        createPostHogClient: () => {
          throw initError
        },
      }))

      // Should not throw
      expect(() =>
        trackEvent({
          event: AnalyticsEvent.APP_LAUNCHED,
          userId: 'user-1',
          logger,
        }),
      ).not.toThrow()

      expect(logger.warn).toHaveBeenCalledWith(
        { error: initError },
        'Failed to initialize analytics client',
      )
    })

    it('tracks without properties', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      expect(mockClient.capture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: undefined,
      })
    })

    it('handles empty string userId', () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: '',
        properties: { foo: 'bar' },
        logger,
      })

      // Empty string userId should still be passed to PostHog
      // (PostHog will handle it as an anonymous user)
      expect(mockClient.capture).toHaveBeenCalledWith({
        distinctId: '',
        event: AnalyticsEvent.APP_LAUNCHED,
        properties: { foo: 'bar' },
      })
    })
  })

  describe('flushAnalytics', () => {
    it('does nothing when client is not initialized', async () => {
      // Client is not initialized in dev mode
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'dev'
      const logger = createMockLogger()

      await flushAnalytics(logger)

      expect(mockClient.flush).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('flushes the client when initialized', async () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      // Initialize the client first
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      await flushAnalytics(logger)

      expect(mockClient.flush).toHaveBeenCalled()
    })

    it('handles flush errors and tracks the failure', async () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()
      const flushError = new Error('Flush failed')
      mockClient.flush = mock(() => Promise.reject(flushError))

      // Initialize the client first
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      await flushAnalytics(logger)

      expect(logger.warn).toHaveBeenCalledWith(
        { error: flushError },
        'Failed to flush analytics',
      )
      // Should try to capture the failure
      expect(mockClient.capture).toHaveBeenCalledWith({
        distinctId: 'system',
        event: AnalyticsEvent.FLUSH_FAILED,
        properties: {
          error: 'Flush failed',
        },
      })
    })

    it('handles flush errors with non-Error objects', async () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()
      mockClient.flush = mock(() => Promise.reject('string error'))

      // Initialize the client first
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      await flushAnalytics(logger)

      expect(mockClient.capture).toHaveBeenCalledWith({
        distinctId: 'system',
        event: AnalyticsEvent.FLUSH_FAILED,
        properties: {
          error: 'string error',
        },
      })
    })

    it('silently ignores errors when tracking the flush failure', async () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()
      mockClient.flush = mock(() => Promise.reject(new Error('Flush failed')))

      // Initialize the client first
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      // Make capture throw after first call (which was trackEvent)
      const originalCapture = mockClient.capture
      let captureCallCount = 0
      mockClient.capture = mock((args) => {
        captureCallCount++
        if (captureCallCount > 1) {
          throw new Error('Capture also failed')
        }
        return originalCapture(args)
      })

      // Should not throw
      await expect(flushAnalytics(logger)).resolves.toBeUndefined()
    })

    it('flushes without logger', async () => {
      mockEnv.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'
      const logger = createMockLogger()

      // Initialize the client first
      trackEvent({
        event: AnalyticsEvent.APP_LAUNCHED,
        userId: 'user-1',
        logger,
      })

      // Call without logger
      await flushAnalytics()

      expect(mockClient.flush).toHaveBeenCalled()
    })
  })
})
