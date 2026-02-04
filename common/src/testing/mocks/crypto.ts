/**
 * Typed crypto mock factory for testing.
 *
 * Provides type-safe mocks for crypto functions, particularly randomUUID.
 * Makes tests deterministic by returning predictable UUIDs.
 *
 * @example
 * ```typescript
 * import { setupCryptoMocks, createMockUuid } from '@codebuff/common/testing/mocks/crypto'
 *
 * // Setup deterministic UUIDs
 * const spies = setupCryptoMocks()
 * await runTest()
 * spies.restore()
 *
 * // Or create specific UUIDs
 * const uuid = createMockUuid('test-prefix')
 * // Returns: 'test-prefix-0000-0000-0000-000000000000'
 * ```
 */

import { spyOn } from 'bun:test'

/**
 * A valid UUID v4 format string.
 */
export type UUID = `${string}-${string}-${string}-${string}-${string}`

/**
 * Options for setting up crypto mocks.
 */
export interface SetupCryptoMocksOptions {
  /**
   * A prefix to use for generated UUIDs.
   * The format will be: `{prefix}-0000-0000-0000-000000000000`
   * @default 'mock-uuid'
   */
  prefix?: string

  /**
   * Whether to generate sequential UUIDs.
   * If true, each call returns a different UUID: mock-uuid-1, mock-uuid-2, etc.
   * @default false
   */
  sequential?: boolean

  /**
   * A specific list of UUIDs to return in order.
   * If provided, UUIDs are returned from this list in sequence.
   * When exhausted, falls back to default behavior.
   */
  uuids?: UUID[]
}

/**
 * Result of setting up crypto mocks.
 */
export interface CryptoMockSpies {
  /** The spy on randomUUID */
  randomUUID: ReturnType<typeof spyOn>
  /** Restore the original implementation */
  restore: () => void
  /** Clear call history */
  clear: () => void
  /** Get the current call count */
  getCallCount: () => number
}

/**
 * Creates a deterministic mock UUID with a given prefix.
 *
 * @param prefix - The prefix for the UUID
 * @param index - Optional index for sequential UUIDs
 * @returns A valid UUID-format string
 *
 * @example
 * ```typescript
 * createMockUuid('test')
 * // Returns: 'test-uuid-0000-0000-000000000000'
 *
 * createMockUuid('test', 5)
 * // Returns: 'test-uuid-0000-0005-000000000000'
 * ```
 */
export function createMockUuid(prefix: string, index?: number): UUID {
  const indexStr =
    index !== undefined ? String(index).padStart(12, '0') : '000000000000'
  return `${prefix}-0000-0000-0000-${indexStr}` as UUID
}

/**
 * Sets up a spy on crypto.randomUUID with deterministic behavior.
 *
 * @param options - Configuration options
 * @returns Object containing the spy and cleanup utilities
 *
 * @example
 * ```typescript
 * describe('my test', () => {
 *   let cryptoSpies: CryptoMockSpies
 *
 *   beforeEach(() => {
 *     cryptoSpies = setupCryptoMocks({ prefix: 'test' })
 *   })
 *
 *   afterEach(() => {
 *     cryptoSpies.restore()
 *   })
 *
 *   it('creates deterministic IDs', async () => {
 *     const result = await createSomething()
 *     expect(result.id).toBe('test-0000-0000-0000-000000000000')
 *   })
 * })
 * ```
 */
export function setupCryptoMocks(
  options: SetupCryptoMocksOptions = {},
): CryptoMockSpies {
  const { prefix = 'mock-uuid', sequential = false, uuids = [] } = options

  let callCount = 0

  const randomUUIDSpy = spyOn(crypto, 'randomUUID').mockImplementation(() => {
    const currentIndex = callCount
    callCount++

    // First try to return from the provided list
    if (currentIndex < uuids.length) {
      return uuids[currentIndex]
    }

    // Then fall back to generated UUIDs
    if (sequential) {
      return createMockUuid(prefix, currentIndex)
    }

    return createMockUuid(prefix)
  })

  return {
    randomUUID: randomUUIDSpy,
    restore: () => {
      randomUUIDSpy.mockRestore()
    },
    clear: () => {
      callCount = 0
      randomUUIDSpy.mockClear()
    },
    getCallCount: () => callCount,
  }
}

/**
 * Sets up crypto mocks that return specific UUIDs in sequence.
 * Useful when you need specific IDs for assertions.
 *
 * @param uuids - The UUIDs to return in order
 * @returns Object containing the spy and cleanup utilities
 *
 * @example
 * ```typescript
 * const spies = setupSequentialCryptoMocks([
 *   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 *   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
 * ])
 *
 * crypto.randomUUID() // 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 * crypto.randomUUID() // 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 * crypto.randomUUID() // 'mock-uuid-0000-0000-0000-000000000002' (fallback)
 * ```
 */
export function setupSequentialCryptoMocks(uuids: UUID[]): CryptoMockSpies {
  return setupCryptoMocks({ uuids, sequential: true })
}

/**
 * A set of commonly used test UUIDs for consistency across tests.
 */
export const TEST_UUIDS = {
  /** Default user ID for tests */
  USER: 'test-user-0000-0000-000000000001' as UUID,
  /** Default session ID for tests */
  SESSION: 'test-sess-0000-0000-000000000001' as UUID,
  /** Default run ID for tests */
  RUN: 'test-run0-0000-0000-000000000001' as UUID,
  /** Default step ID for tests */
  STEP: 'test-step-0000-0000-000000000001' as UUID,
  /** Default message ID for tests */
  MESSAGE: 'test-msg0-0000-0000-000000000001' as UUID,
  /** Default agent ID for tests */
  AGENT: 'test-agnt-0000-0000-000000000001' as UUID,
} as const

/**
 * Creates a UUID generator that returns sequential UUIDs with a prefix.
 * Useful for generating multiple related IDs.
 *
 * @param prefix - The prefix for generated UUIDs
 * @returns A function that generates sequential UUIDs
 *
 * @example
 * ```typescript
 * const generateId = createUuidGenerator('item')
 *
 * generateId() // 'item-uuid-0000-0000-000000000000'
 * generateId() // 'item-uuid-0000-0001-000000000000'
 * generateId() // 'item-uuid-0000-0002-000000000000'
 * ```
 */
export function createUuidGenerator(prefix: string): () => UUID {
  let index = 0
  return () => {
    const uuid = createMockUuid(prefix, index)
    index++
    return uuid
  }
}
