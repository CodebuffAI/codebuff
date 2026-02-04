/**
 * Test setup utilities for common patterns.
 *
 * Provides helper functions for setting up and tearing down test fixtures
 * in a consistent way across the codebase.
 *
 * @example
 * ```typescript
 * import { createTestSetup, TestSetupResult } from '@codebuff/common/testing/setup'
 *
 * describe('my test', () => {
 *   const setup = createTestSetup()
 *
 *   beforeEach(() => setup.beforeEach())
 *   afterEach(() => setup.afterEach())
 * })
 * ```
 */

import { setupAnalyticsMocks } from './mocks/analytics'
import { setupCryptoMocks } from './mocks/crypto'
import { setupDbSpies } from './mocks/database'
import { createMockLogger } from './mocks/logger'
import { resetToolCallIdCounter } from './mocks/stream'

import type {
  AnalyticsSpies,
  TrackEventFn,
  FlushAnalyticsFn,
} from './mocks/analytics'
import type { CryptoMockSpies } from './mocks/crypto'
import type { DbSpies } from './mocks/database'
import type { MockLogger } from './mocks/logger'

/**
 * Options for creating a test setup.
 */
export interface CreateTestSetupOptions {
  /**
   * Whether to set up analytics mocks.
   * @default true
   */
  analytics?: boolean

  /**
   * Whether to set up crypto mocks.
   * @default true
   */
  crypto?: boolean

  /**
   * Whether to set up database mocks.
   * Requires passing the db module.
   * @default false
   */
  database?: boolean

  /**
   * The database module to mock (required if database is true).
   * Must have insert and update methods that are functions.
   */
  dbModule?: {
    insert: (...args: unknown[]) => unknown
    update: (...args: unknown[]) => unknown
  }

  /**
   * The analytics module to mock (required if analytics is true).
   */
  analyticsModule?: {
    trackEvent: TrackEventFn
    flushAnalytics: FlushAnalyticsFn
  }

  /**
   * Prefix for crypto mock UUIDs.
   * @default 'test'
   */
  cryptoPrefix?: string
}

/**
 * Result of creating a test setup.
 */
export interface TestSetupResult {
  /** The mock logger instance */
  logger: MockLogger

  /** Analytics spies (if enabled) */
  analyticsSpy?: AnalyticsSpies

  /** Crypto spies (if enabled) */
  cryptoSpy?: CryptoMockSpies

  /** Database spies (if enabled) */
  dbSpy?: DbSpies

  /** Call this in beforeEach */
  beforeEach: () => void

  /** Call this in afterEach */
  afterEach: () => void

  /** Restore all mocks */
  restore: () => void
}

/**
 * Creates a test setup with common mocks pre-configured.
 *
 * @param options - Configuration options
 * @returns A test setup result with mocks and lifecycle methods
 *
 * @example
 * ```typescript
 * import * as analytics from '@codebuff/common/analytics'
 * import db from '@codebuff/internal/db'
 *
 * describe('my test', () => {
 *   const setup = createTestSetup({
 *     analytics: true,
 *     analyticsModule: analytics,
 *     database: true,
 *     dbModule: db,
 *   })
 *
 *   beforeEach(() => setup.beforeEach())
 *   afterEach(() => setup.afterEach())
 *
 *   it('does something', () => {
 *     expect(setup.analyticsSpy.trackEvent).toHaveBeenCalled()
 *   })
 * })
 * ```
 */
export function createTestSetup(
  options: CreateTestSetupOptions = {},
): TestSetupResult {
  const {
    analytics = true,
    crypto = true,
    database = false,
    dbModule,
    analyticsModule,
    cryptoPrefix = 'test',
  } = options

  const logger = createMockLogger()
  let analyticsSpy: AnalyticsSpies | undefined
  let cryptoSpy: CryptoMockSpies | undefined
  let dbSpy: DbSpies | undefined

  const beforeEach = (): void => {
    // Reset tool call ID counter for deterministic tests
    resetToolCallIdCounter()

    // Set up analytics mocks
    if (analytics && analyticsModule) {
      analyticsSpy = setupAnalyticsMocks(analyticsModule)
    }

    // Set up crypto mocks
    if (crypto) {
      cryptoSpy = setupCryptoMocks({ prefix: cryptoPrefix, sequential: true })
    }

    // Set up database mocks
    if (database && dbModule) {
      dbSpy = setupDbSpies(dbModule)
    }
  }

  const afterEach = (): void => {
    // Restore all mocks
    analyticsSpy?.restore()
    cryptoSpy?.restore()
    dbSpy?.restore()

    // Reset the spies
    analyticsSpy = undefined
    cryptoSpy = undefined
    dbSpy = undefined
  }

  const restore = afterEach

  return {
    logger,
    get analyticsSpy() {
      return analyticsSpy
    },
    get cryptoSpy() {
      return cryptoSpy
    },
    get dbSpy() {
      return dbSpy
    },
    beforeEach,
    afterEach,
    restore,
  }
}

/**
 * A simple sleep function for async tests.
 *
 * @param ms - Milliseconds to sleep
 * @returns A promise that resolves after the specified time
 *
 * @example
 * ```typescript
 * await sleep(100) // Wait 100ms
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Waits for a condition to be true, polling at the specified interval.
 *
 * @param condition - Function that returns true when the condition is met
 * @param timeout - Maximum time to wait in ms
 * @param interval - Polling interval in ms
 * @returns A promise that resolves when the condition is met
 * @throws Error if the timeout is reached
 *
 * @example
 * ```typescript
 * await waitFor(() => document.querySelector('.loaded') !== null)
 * ```
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 50,
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const result = await condition()
    if (result) {
      return
    }
    await sleep(interval)
  }

  throw new Error(`waitFor timed out after ${timeout}ms`)
}

/**
 * Wraps a function to capture its call arguments.
 * Useful for verifying function calls in tests.
 *
 * @param fn - The function to wrap
 * @returns An object with the wrapped function and captured calls
 *
 * @example
 * ```typescript
 * const { fn, calls } = captureCallArgs((a: number, b: string) => a + b.length)
 *
 * fn(1, 'hello')
 * fn(2, 'world')
 *
 * expect(calls).toEqual([
 *   [1, 'hello'],
 *   [2, 'world'],
 * ])
 * ```
 */
export function captureCallArgs<T extends unknown[], R>(
  fn: (...args: T) => R,
): { fn: (...args: T) => R; calls: T[] } {
  const calls: T[] = []

  const wrappedFn = (...args: T): R => {
    calls.push(args)
    return fn(...args)
  }

  return { fn: wrappedFn, calls }
}
