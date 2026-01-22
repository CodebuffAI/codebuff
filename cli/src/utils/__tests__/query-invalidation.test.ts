import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  invalidateQuery,
  removeQuery,
  getQueryData,
  setQueryData,
  fullDeleteCacheEntry,
} from '../query-invalidation'
import {
  getCacheEntry,
  getGeneration,
  setCacheEntry,
  setGcTimeout,
  resetCache,
  serializeQueryKey,
} from '../query-cache'
import { getRetryCount, setRetryCount, resetExecutorState } from '../query-executor'

describe('invalidateQuery', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('marks entry as stale by setting dataUpdatedAt to 0', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    // Set fresh data
    setQueryData<{ name: string }>(queryKey, { name: 'John' })

    const beforeEntry = getCacheEntry(key)
    expect(beforeEntry?.dataUpdatedAt).toBeGreaterThan(0)

    // Invalidate
    invalidateQuery(queryKey)

    const afterEntry = getCacheEntry(key)
    expect(afterEntry?.dataUpdatedAt).toBe(0)
  })

  test('preserves data when invalidating', () => {
    const queryKey = ['users']

    setQueryData<{ name: string }>(queryKey, { name: 'John' })

    invalidateQuery(queryKey)

    expect(getQueryData<{ name: string }>(queryKey)).toEqual({ name: 'John' })
  })

  test('preserves error when invalidating', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    // Set entry with error
    const error = new Error('Previous error')
    const entry = {
      data: 'stale',
      dataUpdatedAt: 1000,
      error,
      errorUpdatedAt: 2000,
    }

    // Set entry directly through cache module
    setCacheEntry(key, entry)

    invalidateQuery(queryKey)

    const afterEntry = getCacheEntry(key)
    expect(afterEntry?.error).toBe(error)
    expect(afterEntry?.errorUpdatedAt).toBe(2000)
  })

  test('does nothing for non-existent key', () => {
    // Should not throw
    expect(() => invalidateQuery(['non-existent'])).not.toThrow()
  })

  test('works with complex query keys', () => {
    const queryKey = ['users', { id: 1, include: ['posts', 'comments'] }]

    setQueryData<{ name: string }>(queryKey, { name: 'John' })
    invalidateQuery(queryKey)

    expect(getQueryData<{ name: string }>(queryKey)).toEqual({ name: 'John' })
  })
})

describe('removeQuery', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('removes entry from cache', () => {
    const queryKey = ['users']

    setQueryData<{ name: string }>(queryKey, { name: 'John' })
    expect(getQueryData<{ name: string }>(queryKey)).toBeDefined()

    removeQuery(queryKey)

    expect(getQueryData<{ name: string }>(queryKey)).toBeUndefined()
  })

  test('bumps generation to prevent resurrection', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    setQueryData<{ name: string }>(queryKey, { name: 'John' })
    expect(getGeneration(key)).toBe(0)

    removeQuery(queryKey)

    expect(getGeneration(key)).toBe(1)
  })

  test('does nothing for non-existent key', () => {
    expect(() => removeQuery(['non-existent'])).not.toThrow()
  })
})

describe('getQueryData', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('returns data for existing key', () => {
    const queryKey = ['users']
    setQueryData<{ name: string }>(queryKey, { name: 'John' })

    expect(getQueryData<{ name: string }>(queryKey)).toEqual({ name: 'John' })
  })

  test('returns undefined for non-existent key', () => {
    expect(getQueryData(['non-existent'])).toBeUndefined()
  })

  test('returns undefined when entry exists but has no data', () => {
    const queryKey = ['error-only']
    const key = serializeQueryKey(queryKey)

    // Set error-only entry
    setCacheEntry(key, {
      data: undefined,
      dataUpdatedAt: 0,
      error: new Error('Failed'),
      errorUpdatedAt: Date.now(),
    })

    expect(getQueryData(queryKey)).toBeUndefined()
  })

  test('works with complex query keys', () => {
    const queryKey = ['posts', { authorId: 1, status: 'published' }]
    setQueryData<{ id: number; title: string }[]>(queryKey, [{ id: 1, title: 'Hello' }])

    expect(getQueryData<{ id: number; title: string }[]>(queryKey)).toEqual([{ id: 1, title: 'Hello' }])
  })

  test('handles various data types', () => {
    // String
    setQueryData<string>(['string'], 'hello')
    expect(getQueryData<string>(['string'])).toBe('hello')

    // Number
    setQueryData<number>(['number'], 42)
    expect(getQueryData<number>(['number'])).toBe(42)

    // Boolean
    setQueryData<boolean>(['boolean'], true)
    expect(getQueryData<boolean>(['boolean'])).toBe(true)

    // Array
    setQueryData<number[]>(['array'], [1, 2, 3])
    expect(getQueryData<number[]>(['array'])).toEqual([1, 2, 3])

    // Object
    setQueryData<{ a: number }>(['object'], { a: 1 })
    expect(getQueryData<{ a: number }>(['object'])).toEqual({ a: 1 })

    // Null
    setQueryData<null>(['null'], null)
    expect(getQueryData<null>(['null'])).toBeNull()
  })
})

describe('setQueryData', () => {
  let originalDateNow: typeof Date.now
  let mockNow: number

  beforeEach(() => {
    resetCache()
    resetExecutorState()
    originalDateNow = Date.now
    mockNow = 1000000
    Date.now = () => mockNow
  })

  afterEach(() => {
    Date.now = originalDateNow
  })

  test('creates cache entry with data', () => {
    const queryKey = ['users']

    setQueryData<{ name: string }>(queryKey, { name: 'John' })

    expect(getQueryData<{ name: string }>(queryKey)).toEqual({ name: 'John' })
  })

  test('sets dataUpdatedAt to current time', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    setQueryData<string>(queryKey, 'data')

    const entry = getCacheEntry(key)
    expect(entry?.dataUpdatedAt).toBe(mockNow)
  })

  test('clears any existing error', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    // Set entry with error first
    setCacheEntry(key, {
      data: 'old',
      dataUpdatedAt: 500,
      error: new Error('Previous error'),
      errorUpdatedAt: 600,
    })

    // Now set new data
    setQueryData<string>(queryKey, 'new')

    const entry = getCacheEntry(key)
    expect(entry?.error).toBeNull()
    expect(entry?.errorUpdatedAt).toBeNull()
  })

  test('overwrites existing data', () => {
    const queryKey = ['users']

    setQueryData<string>(queryKey, 'first')
    setQueryData<string>(queryKey, 'second')

    expect(getQueryData<string>(queryKey)).toBe('second')
  })

  test('works with complex query keys', () => {
    const queryKey = ['query', { filter: { active: true }, sort: 'name' }]

    setQueryData<{ results: unknown[] }>(queryKey, { results: [] })

    expect(getQueryData<{ results: unknown[] }>(queryKey)).toEqual({ results: [] })
  })
})

describe('fullDeleteCacheEntry', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('deletes cache entry', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    setQueryData<string>(queryKey, 'data')

    fullDeleteCacheEntry(key)

    expect(getQueryData<string>(queryKey)).toBeUndefined()
  })

  test('clears retry state', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    setRetryCount(key, 3)

    fullDeleteCacheEntry(key)

    expect(getRetryCount(key)).toBe(0)
  })

  test('clears GC timeout', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)
    let gcFired = false

    setQueryData<string>(queryKey, 'data')

    const timeoutId = setTimeout(() => {
      gcFired = true
    }, 10)
    setGcTimeout(key, timeoutId)

    fullDeleteCacheEntry(key)

    // Wait to ensure timeout would have fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(gcFired).toBe(false)
        resolve()
      }, 50)
    })
  })

  test('bumps generation', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    setQueryData<string>(queryKey, 'data')
    expect(getGeneration(key)).toBe(0)

    fullDeleteCacheEntry(key)

    expect(getGeneration(key)).toBe(1)
  })

  test('deleting non-existent key still bumps generation', () => {
    const key = 'non-existent-key'

    expect(getGeneration(key)).toBe(0)

    fullDeleteCacheEntry(key)

    expect(getGeneration(key)).toBe(1)
  })
})

describe('integration scenarios', () => {
  beforeEach(() => {
    resetCache()
    resetExecutorState()
  })

  test('set, invalidate, then update workflow', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    // Initial set
    setQueryData<{ name: string }>(queryKey, { name: 'John' })
    const entry1 = getCacheEntry(key)
    expect(entry1?.dataUpdatedAt).toBeGreaterThan(0)

    // Invalidate - marks stale
    invalidateQuery(queryKey)
    const entry2 = getCacheEntry(key)
    expect(entry2?.dataUpdatedAt).toBe(0)
    expect(entry2?.data).toEqual({ name: 'John' })

    // Update with new data
    setQueryData<{ name: string }>(queryKey, { name: 'Jane' })
    const entry3 = getCacheEntry(key)
    expect(entry3?.dataUpdatedAt).toBeGreaterThan(0)
    expect(entry3?.data).toEqual({ name: 'Jane' })
  })

  test('set, remove, then set again workflow', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    // Initial set
    setQueryData<string>(queryKey, 'first')
    expect(getGeneration(key)).toBe(0)

    // Remove
    removeQuery(queryKey)
    expect(getQueryData<string>(queryKey)).toBeUndefined()
    expect(getGeneration(key)).toBe(1)

    // Set again
    setQueryData<string>(queryKey, 'second')
    expect(getQueryData<string>(queryKey)).toBe('second')
  })

  test('multiple keys are independent', () => {
    const key1 = ['users', 1]
    const key2 = ['users', 2]

    setQueryData<{ name: string }>(key1, { name: 'John' })
    setQueryData<{ name: string }>(key2, { name: 'Jane' })

    invalidateQuery(key1)

    // key1 is invalidated
    expect(getCacheEntry(serializeQueryKey(key1))?.dataUpdatedAt).toBe(0)

    // key2 is still fresh
    expect(getCacheEntry(serializeQueryKey(key2))?.dataUpdatedAt).toBeGreaterThan(0)
  })

  test('fullDeleteCacheEntry is comprehensive cleanup', () => {
    const queryKey = ['users']
    const key = serializeQueryKey(queryKey)

    // Set up various state
    setQueryData<string>(queryKey, 'data')
    setRetryCount(key, 3)

    const timeoutId = setTimeout(() => {}, 1000)
    setGcTimeout(key, timeoutId)

    // Full delete should clean everything
    fullDeleteCacheEntry(key)

    expect(getQueryData<string>(queryKey)).toBeUndefined()
    expect(getRetryCount(key)).toBe(0)
    expect(getGeneration(key)).toBe(1)
  })
})
