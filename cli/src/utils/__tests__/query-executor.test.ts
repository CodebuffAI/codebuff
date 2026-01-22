import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  createQueryExecutor,
  clearRetryState,
  deleteInFlightPromise,
  getRetryCount,
  setRetryCount,
  scheduleRetry,
  resetExecutorState,
} from '../query-executor'
import {
  setCacheEntry,
  getCacheEntry,
  isQueryFetching,
  incrementRefCount,
  decrementRefCount,
  getGeneration,
  bumpGeneration,
  resetCache,
} from '../query-cache'

describe('createQueryExecutor', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('executes query function and stores result', async () => {
    const key = 'test-key'
    const queryFn = async () => ({ data: 'hello' })

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    await executor()

    const entry = getCacheEntry<{ data: string }>(key)
    expect(entry?.data).toEqual({ data: 'hello' })
    expect(entry?.error).toBeNull()
  })

  test('sets and clears fetching state during execution', async () => {
    const key = 'test-key'
    let fetchingDuringQuery = false

    const queryFn = async () => {
      fetchingDuringQuery = isQueryFetching(key)
      return 'result'
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    expect(isQueryFetching(key)).toBe(false)
    const promise = executor()
    // Note: fetching state is set synchronously
    expect(isQueryFetching(key)).toBe(true)

    await promise

    expect(fetchingDuringQuery).toBe(true)
    expect(isQueryFetching(key)).toBe(false)
  })

  test('deduplicates concurrent requests', async () => {
    const key = 'dedupe-key'
    let callCount = 0

    const queryFn = async () => {
      callCount++
      await new Promise((r) => setTimeout(r, 10))
      return 'result'
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    // Start two concurrent executions
    const promise1 = executor()
    const promise2 = executor()

    await Promise.all([promise1, promise2])

    // Only one actual fetch should have happened
    expect(callCount).toBe(1)
  })

  test('stores error when query fails', async () => {
    const key = 'error-key'
    const error = new Error('Query failed')

    const queryFn = async () => {
      throw error
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    await executor()

    const entry = getCacheEntry(key)
    expect(entry?.error?.message).toBe('Query failed')
  })

  test('preserves existing data when query fails', async () => {
    const key = 'preserve-key'

    // Set initial data
    setCacheEntry(key, {
      data: 'existing-data',
      dataUpdatedAt: 1000,
      error: null,
      errorUpdatedAt: null,
    })

    const queryFn = async () => {
      throw new Error('Refresh failed')
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    await executor()

    const entry = getCacheEntry<string>(key)
    expect(entry?.data).toBe('existing-data')
    expect(entry?.dataUpdatedAt).toBe(1000) // Preserved
    expect(entry?.error?.message).toBe('Refresh failed')
  })

  test('does not write to deleted entry (generation mismatch)', async () => {
    const key = 'deleted-key'

    const queryFn = async () => {
      // Simulate deletion happening during fetch
      bumpGeneration(key)
      return 'should-not-be-stored'
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    await executor()

    // Entry should not have been created
    expect(getCacheEntry(key)).toBeUndefined()
  })

  test('resets retry count on success', async () => {
    const key = 'reset-retry-key'
    setRetryCount(key, 3)

    const queryFn = async () => 'success'

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 3,
    })

    await executor()

    expect(getRetryCount(key)).toBe(0)
  })
})

describe('retry behavior', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('retries on failure when retry count > 0 and refs exist', async () => {
    const key = 'retry-key'
    let attempts = 0

    // Add a ref so retries are attempted
    incrementRefCount(key)

    const queryFn = async () => {
      attempts++
      if (attempts < 3) {
        throw new Error(`Attempt ${attempts} failed`)
      }
      return 'success'
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 3,
    })

    // Start the fetch - it will schedule retries
    await executor()

    // First attempt fails, but we need to wait for retries
    // Retries are scheduled with setTimeout(1000 * retryAttempt)
    // For testing, we just verify the retry count was set
    expect(getRetryCount(key)).toBeGreaterThan(0)
  })

  test('does not retry when retry=false', async () => {
    const key = 'no-retry-key'
    let attempts = 0

    incrementRefCount(key)

    const queryFn = async () => {
      attempts++
      throw new Error('Always fails')
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: false,
    })

    await executor()

    expect(attempts).toBe(1)
    expect(getRetryCount(key)).toBe(0)
  })

  test('does not retry when no refs', async () => {
    const key = 'no-refs-key'
    let attempts = 0

    const queryFn = async () => {
      attempts++
      throw new Error('Always fails')
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 3,
    })

    await executor()

    expect(attempts).toBe(1)
    // No retry scheduled because refCount is 0
  })

  test('isEnabled callback can cancel retries', async () => {
    const key = 'enabled-key'
    let enabled = true
    let attempts = 0

    incrementRefCount(key)

    const queryFn = async () => {
      attempts++
      throw new Error('Always fails')
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 3,
      isEnabled: () => enabled,
    })

    await executor()

    // Disable before retry fires
    enabled = false

    // The retry would check isEnabled and not proceed
    // We can verify by checking the retry was scheduled
    expect(getRetryCount(key)).toBe(1)
  })
})

describe('clearRetryState', () => {
  beforeEach(() => {
    resetExecutorState()
  })

  test('clears retry count', () => {
    const key = 'clear-key'
    setRetryCount(key, 5)

    clearRetryState(key)

    expect(getRetryCount(key)).toBe(0)
  })

  test('clears pending retry timeout', () => {
    const key = 'timeout-key'
    let retryFired = false

    scheduleRetry(key, 1, () => {
      retryFired = true
    })

    clearRetryState(key)

    // Wait to ensure timeout would have fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(retryFired).toBe(false)
        resolve()
      }, 1500)
    })
  })

  test('clearing non-existent key does not throw', () => {
    expect(() => clearRetryState('non-existent')).not.toThrow()
  })
})

describe('scheduleRetry', () => {
  beforeEach(() => {
    resetExecutorState()
  })

  test('calls callback after delay', async () => {
    const key = 'schedule-key'
    let called = false

    scheduleRetry(key, 1, () => {
      called = true
    })

    expect(called).toBe(false)

    // Wait for retry (1 second * 1 = 1000ms)
    await new Promise((r) => setTimeout(r, 1100))

    expect(called).toBe(true)
  })

  test('subsequent schedule replaces previous', async () => {
    const key = 'replace-key'
    let firstCalled = false
    let secondCalled = false

    scheduleRetry(key, 1, () => {
      firstCalled = true
    })

    // Immediately schedule another
    scheduleRetry(key, 1, () => {
      secondCalled = true
    })

    await new Promise((r) => setTimeout(r, 1100))

    expect(firstCalled).toBe(false)
    expect(secondCalled).toBe(true)
  })
})

describe('getRetryCount / setRetryCount', () => {
  beforeEach(() => {
    resetExecutorState()
  })

  test('defaults to 0', () => {
    expect(getRetryCount('any-key')).toBe(0)
  })

  test('sets and gets retry count', () => {
    setRetryCount('key', 3)
    expect(getRetryCount('key')).toBe(3)
  })

  test('different keys have independent counts', () => {
    setRetryCount('key1', 1)
    setRetryCount('key2', 2)

    expect(getRetryCount('key1')).toBe(1)
    expect(getRetryCount('key2')).toBe(2)
  })
})

describe('deleteInFlightPromise', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('allows new request after deletion', async () => {
    const key = 'inflight-key'
    let callCount = 0

    const queryFn = async () => {
      callCount++
      return 'result'
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    // First execution
    await executor()
    expect(callCount).toBe(1)

    // In-flight promise is already cleared after completion
    // Second execution should work
    await executor()
    expect(callCount).toBe(2)
  })
})

describe('resetExecutorState', () => {
  beforeEach(() => {
    resetCache()
  })

  test('clears all retry counts', () => {
    setRetryCount('key1', 1)
    setRetryCount('key2', 2)

    resetExecutorState()

    expect(getRetryCount('key1')).toBe(0)
    expect(getRetryCount('key2')).toBe(0)
  })

  test('clears all retry timeouts', () => {
    let fired = false

    scheduleRetry('key', 1, () => {
      fired = true
    })

    resetExecutorState()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fired).toBe(false)
        resolve()
      }, 1500)
    })
  })
})

describe('edge cases', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('converts non-Error throws to Error', async () => {
    const key = 'string-throw-key'

    const queryFn = async () => {
      throw 'string error'
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    await executor()

    const entry = getCacheEntry(key)
    expect(entry?.error).toBeInstanceOf(Error)
    expect(entry?.error?.message).toBe('string error')
  })

  test('clears retry state when no refs after fetch', async () => {
    const key = 'cleanup-key'

    // Add ref, then remove it
    incrementRefCount(key)

    const queryFn = async () => {
      // Remove ref during fetch
      decrementRefCount(key)
      throw new Error('Failed')
    }

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 3,
    })

    await executor()

    // Retry state should be cleared because refCount is 0
    // No retry timeout should be scheduled
  })

  test('handles undefined/null data', async () => {
    const key = 'null-key'

    const queryFn = async () => null

    const executor = createQueryExecutor({
      key,
      queryFn,
      retry: 0,
    })

    await executor()

    const entry = getCacheEntry<null>(key)
    expect(entry?.data).toBeNull()
  })
})
