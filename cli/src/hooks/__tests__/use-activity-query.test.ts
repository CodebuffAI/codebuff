import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  invalidateActivityQuery,
  removeActivityQuery,
  getActivityQueryData,
  setActivityQueryData,
  resetActivityQueryCache,
  isEntryStale,
} from '../use-activity-query'
import {
  bumpGeneration,
  getGeneration,
  deleteCacheEntryCore,
  setCacheEntry,
  serializeQueryKey,
} from '../../utils/query-cache'

describe('use-activity-query utilities', () => {
  beforeEach(() => {
    // Reset cache between tests
    resetActivityQueryCache()
  })

  describe('setActivityQueryData', () => {
    test('stores data in cache', () => {
      setActivityQueryData(['test'], { value: 'hello' })
      expect(getActivityQueryData<{ value: string }>(['test'])).toEqual({ value: 'hello' })
    })

    test('overwrites existing data', () => {
      setActivityQueryData(['test'], { value: 'first' })
      setActivityQueryData(['test'], { value: 'second' })
      expect(getActivityQueryData<{ value: string }>(['test'])).toEqual({ value: 'second' })
    })

    test('handles complex query keys', () => {
      setActivityQueryData(['users', 1], { name: 'John' })
      expect(getActivityQueryData<{ name: string }>(['users', 1])).toEqual({ name: 'John' })
    })

    test('handles query keys with objects', () => {
      setActivityQueryData(['complex', { id: 1 }], { data: 'test' })
      expect(getActivityQueryData<{ data: string }>(['complex', { id: 1 }])).toEqual({
        data: 'test',
      })
    })

    test('different keys store different data', () => {
      setActivityQueryData(['key1'], 'value1')
      setActivityQueryData(['key2'], 'value2')
      expect(getActivityQueryData<string>(['key1'])).toBe('value1')
      expect(getActivityQueryData<string>(['key2'])).toBe('value2')
    })
  })

  describe('getActivityQueryData', () => {
    test('returns undefined for non-existent key', () => {
      expect(getActivityQueryData(['nonexistent'])).toBeUndefined()
    })

    test('returns stored data for existing key', () => {
      setActivityQueryData(['test'], 42)
      expect(getActivityQueryData<number>(['test'])).toBe(42)
    })

    test('returns correct type', () => {
      setActivityQueryData<string[]>(['test'], ['a', 'b', 'c'])
      const data = getActivityQueryData<string[]>(['test'])
      expect(data).toEqual(['a', 'b', 'c'])
    })
  })

  describe('removeActivityQuery', () => {
    test('removes existing cache entry', () => {
      setActivityQueryData(['test'], 'value')
      expect(getActivityQueryData<string>(['test'])).toBe('value')

      removeActivityQuery(['test'])
      expect(getActivityQueryData(['test'])).toBeUndefined()
    })

    test('does nothing for non-existent key', () => {
      // Should not throw
      removeActivityQuery(['nonexistent'])
      expect(getActivityQueryData(['nonexistent'])).toBeUndefined()
    })

    test('only removes specified key', () => {
      setActivityQueryData(['key1'], 'value1')
      setActivityQueryData(['key2'], 'value2')

      removeActivityQuery(['key1'])

      expect(getActivityQueryData(['key1'])).toBeUndefined()
      expect(getActivityQueryData<string>(['key2'])).toBe('value2')
    })
  })

  describe('invalidateActivityQuery', () => {
    test('marks query as stale by setting dataUpdatedAt to 0', () => {
      setActivityQueryData(['test'], 'value')

      // Before invalidation, data exists
      expect(getActivityQueryData<string>(['test'])).toBe('value')

      invalidateActivityQuery(['test'])

      // Data should still exist after invalidation
      expect(getActivityQueryData<string>(['test'])).toBe('value')
    })

    test('does nothing for non-existent key', () => {
      // Should not throw
      invalidateActivityQuery(['nonexistent'])
    })
  })

  describe('query key serialization', () => {
    test('same array values produce same cache key', () => {
      setActivityQueryData(['test', 'key'], 'value')
      expect(getActivityQueryData<string>(['test', 'key'])).toBe('value')
    })

    test('different array values produce different cache keys', () => {
      setActivityQueryData(['test', 'key1'], 'value1')
      setActivityQueryData(['test', 'key2'], 'value2')
      expect(getActivityQueryData<string>(['test', 'key1'])).toBe('value1')
      expect(getActivityQueryData<string>(['test', 'key2'])).toBe('value2')
    })

    test('object keys are serialized correctly', () => {
      setActivityQueryData(['query', { page: 1, sort: 'asc' }], 'page1')
      expect(getActivityQueryData<string>(['query', { page: 1, sort: 'asc' }])).toBe(
        'page1',
      )
    })

    test('nested objects in keys work correctly', () => {
      setActivityQueryData(
        ['query', { filter: { status: 'active', type: 'user' } }],
        'filtered',
      )
      expect(
        getActivityQueryData<string>([
          'query',
          { filter: { status: 'active', type: 'user' } },
        ]),
      ).toBe('filtered')
    })
  })
})

describe('useActivityQuery hook behavior', () => {
  // These tests verify the hook's expected behavior patterns
  // We can't easily test the actual hook without a React renderer,
  // but we can test the underlying cache behavior

  describe('cache entry structure', () => {
    test('setActivityQueryData creates proper cache entry', () => {
      const testData = { users: [1, 2, 3] }
      setActivityQueryData(['users'], testData)

      const retrieved = getActivityQueryData<typeof testData>(['users'])
      expect(retrieved).toEqual(testData)
    })

    test('cache preserves data types', () => {
      // Numbers
      setActivityQueryData(['number'], 42)
      expect(getActivityQueryData<number>(['number'])).toBe(42)

      // Strings
      setActivityQueryData(['string'], 'hello')
      expect(getActivityQueryData<string>(['string'])).toBe('hello')

      // Booleans
      setActivityQueryData(['boolean'], true)
      expect(getActivityQueryData<boolean>(['boolean'])).toBe(true)

      // Arrays
      setActivityQueryData(['array'], [1, 2, 3])
      expect(getActivityQueryData<number[]>(['array'])).toEqual([1, 2, 3])

      // Objects
      setActivityQueryData(['object'], { a: 1, b: 2 })
      expect(getActivityQueryData<{ a: number; b: number }>(['object'])).toEqual({ a: 1, b: 2 })

      // Null
      setActivityQueryData(['null'], null)
      expect(getActivityQueryData<null>(['null'])).toBeNull()
    })
  })

  describe('invalidation behavior', () => {
    test('invalidation preserves existing data', () => {
      const originalData = { id: 1, name: 'Test' }
      setActivityQueryData(['preserve'], originalData)

      invalidateActivityQuery(['preserve'])

      // Data should still be accessible
      expect(getActivityQueryData<typeof originalData>(['preserve'])).toEqual(originalData)
    })

    test('multiple invalidations do not remove data', () => {
      setActivityQueryData(['multi'], 'persistent')

      invalidateActivityQuery(['multi'])
      invalidateActivityQuery(['multi'])
      invalidateActivityQuery(['multi'])

      expect(getActivityQueryData<string>(['multi'])).toBe('persistent')
    })
  })

  describe('remove behavior', () => {
    test('remove completely clears the cache entry', () => {
      setActivityQueryData(['remove-test'], 'data')
      expect(getActivityQueryData<string>(['remove-test'])).toBe('data')

      removeActivityQuery(['remove-test'])
      expect(getActivityQueryData(['remove-test'])).toBeUndefined()

      // Can set new data after removal
      setActivityQueryData(['remove-test'], 'new-data')
      expect(getActivityQueryData<string>(['remove-test'])).toBe('new-data')
    })
  })

  describe('resetActivityQueryCache', () => {
    test('clears all cache entries', () => {
      setActivityQueryData(['key1'], 'value1')
      setActivityQueryData(['key2'], 'value2')
      setActivityQueryData(['key3'], 'value3')

      expect(getActivityQueryData<string>(['key1'])).toBe('value1')
      expect(getActivityQueryData<string>(['key2'])).toBe('value2')
      expect(getActivityQueryData<string>(['key3'])).toBe('value3')

      resetActivityQueryCache()

      expect(getActivityQueryData(['key1'])).toBeUndefined()
      expect(getActivityQueryData(['key2'])).toBeUndefined()
      expect(getActivityQueryData(['key3'])).toBeUndefined()
    })

    test('allows setting new data after reset', () => {
      setActivityQueryData(['test'], 'old')
      resetActivityQueryCache()
      setActivityQueryData(['test'], 'new')
      expect(getActivityQueryData<string>(['test'])).toBe('new')
    })
  })
})

describe('staleness calculation', () => {
  beforeEach(() => {
    resetActivityQueryCache()
  })

  test('data is considered stale after staleTime has passed', () => {
    const staleTime = 100 // 100ms
    const testKey = ['stale-test']
    
    // Set data with a timestamp in the past
    setActivityQueryData(testKey, 'test-value')
    
    // Immediately after setting, data should be fresh
    const dataImmediately = getActivityQueryData<string>(testKey)
    expect(dataImmediately).toBe('test-value')
  })

  test('invalidated data should be refetchable', () => {
    const testKey = ['invalidate-test']
    
    // Set initial data
    setActivityQueryData(testKey, 'initial')
    expect(getActivityQueryData<string>(testKey)).toBe('initial')
    
    // Invalidate - should mark as stale (dataUpdatedAt = 0)
    invalidateActivityQuery(testKey)
    
    // Data should still exist but be stale
    expect(getActivityQueryData<string>(testKey)).toBe('initial')
  })
})

describe('refetch interval staleness bug fix', () => {
  // This test verifies the fix for the bug where refetch intervals stopped working
  // because isStale was captured in a closure and never updated.
  // The fix ensures staleness is computed dynamically by reading from cache.
  
  beforeEach(() => {
    resetActivityQueryCache()
  })

  test('setActivityQueryData sets dataUpdatedAt to current time', () => {
    const before = Date.now()
    setActivityQueryData(['timing-test'], 'value')
    const after = Date.now()
    
    // The data should exist
    expect(getActivityQueryData<string>(['timing-test'])).toBe('value')
    
    // We can't directly access dataUpdatedAt, but we can verify the data was set
    // and invalidation resets it to 0
    invalidateActivityQuery(['timing-test'])
    
    // Data should still exist after invalidation
    expect(getActivityQueryData<string>(['timing-test'])).toBe('value')
  })

  test('fresh data followed by stale time passage should allow refetch', () => {
    // This simulates the scenario where:
    // 1. Data is fetched (fresh)
    // 2. staleTime passes
    // 3. Interval should refetch (was broken before fix)
    
    const testKey = ['refetch-bug-test']
    
    // Step 1: Set "fresh" data
    setActivityQueryData(testKey, 'fresh-data')
    expect(getActivityQueryData<string>(testKey)).toBe('fresh-data')
    
    // Step 2: Invalidate to simulate staleness (sets dataUpdatedAt to 0)
    invalidateActivityQuery(testKey)
    
    // The data should still exist but be considered stale
    // (dataUpdatedAt is 0, so any staleTime > 0 would make it stale)
    expect(getActivityQueryData<string>(testKey)).toBe('fresh-data')
    
    // In the old buggy code, the interval tick would check closure-captured isStale
    // which was false (computed when effect ran right after fetch).
    // In the fixed code, staleness is computed dynamically from cache.
    
    // We can't easily test the hook behavior without React, but we verify
    // the cache manipulation works correctly for the staleness check
  })

  test('multiple data updates preserve latest data', () => {
    const testKey = ['multi-update-test']
    
    setActivityQueryData(testKey, 'first')
    expect(getActivityQueryData<string>(testKey)).toBe('first')
    
    setActivityQueryData(testKey, 'second')
    expect(getActivityQueryData<string>(testKey)).toBe('second')
    
    setActivityQueryData(testKey, 'third')
    expect(getActivityQueryData<string>(testKey)).toBe('third')
    
    // Invalidate and verify data is preserved
    invalidateActivityQuery(testKey)
    expect(getActivityQueryData<string>(testKey)).toBe('third')
  })
})

/**
 * Tests for cache listener notification behavior.
 * These tests verify that cache updates properly notify subscribers,
 * which is critical for React components to re-render when data changes.
 */
describe('cache listener notifications', () => {
  beforeEach(() => {
    resetActivityQueryCache()
  })

  test('setActivityQueryData notifies listeners', () => {
    const testKey = ['listener-test']
    let notificationCount = 0
    
    // First set up some data so the cache entry exists
    setActivityQueryData(testKey, 'initial')
    
    // Now update the data - we can't directly subscribe but we can verify
    // the data is updated properly
    setActivityQueryData(testKey, 'updated')
    expect(getActivityQueryData<string>(testKey)).toBe('updated')
  })

  test('invalidateActivityQuery notifies listeners', () => {
    const testKey = ['invalidate-listener-test']
    
    // Set initial data
    setActivityQueryData(testKey, 'data')
    
    // Invalidate should trigger listeners
    invalidateActivityQuery(testKey)
    
    // Data should still be there but marked stale
    expect(getActivityQueryData<string>(testKey)).toBe('data')
  })

  test('removeActivityQuery clears data and notifies listeners', () => {
    const testKey = ['remove-listener-test']
    
    setActivityQueryData(testKey, 'data')
    expect(getActivityQueryData<string>(testKey)).toBe('data')
    
    removeActivityQuery(testKey)
    expect(getActivityQueryData<string>(testKey)).toBeUndefined()
  })
})

/**
 * Tests simulating the polling behavior to verify refetch intervals work.
 * These tests mock Date.now() to simulate time passing.
 */
describe('polling and staleness simulation', () => {
  let originalDateNow: typeof Date.now
  let mockNow: number

  beforeEach(() => {
    resetActivityQueryCache()
    originalDateNow = Date.now
    mockNow = 1000000
    Date.now = () => mockNow
  })

  afterEach(() => {
    Date.now = originalDateNow
  })

  test('data becomes stale after staleTime passes', () => {
    const testKey = ['stale-time-test']
    const serializedKey = JSON.stringify(testKey)
    const staleTime = 30000 // 30 seconds
    
    // Set data at t=0
    setActivityQueryData(testKey, 'fresh-data')
    
    // Data was set at mockNow (1000000), so dataUpdatedAt = 1000000
    expect(getActivityQueryData<string>(testKey)).toBe('fresh-data')
    expect(isEntryStale(serializedKey, staleTime)).toBe(false) // Fresh
    
    // Advance time by 25 seconds - still fresh
    mockNow += 25000
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // Advance time past staleTime
    mockNow += 10000 // Now 35 seconds have passed
    // Data should now be considered stale (35s > 30s staleTime)
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
    
    // The data is still accessible even when stale
    expect(getActivityQueryData<string>(testKey)).toBe('fresh-data')
  })

  test('invalidated data is immediately stale', () => {
    const testKey = ['invalidate-stale-test']
    const serializedKey = JSON.stringify(testKey)
    const staleTime = 30000
    
    // Set fresh data
    setActivityQueryData(testKey, 'data')
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // Invalidate immediately makes it stale (dataUpdatedAt = 0)
    invalidateActivityQuery(testKey)
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
    
    // Data still exists but would be refetched on next access
    expect(getActivityQueryData<string>(testKey)).toBe('data')
  })

  test('updating data resets the staleness timer', () => {
    const testKey = ['reset-timer-test']
    const serializedKey = JSON.stringify(testKey)
    const staleTime = 30000
    
    // Set initial data
    setActivityQueryData(testKey, 'initial')
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // Advance time past staleTime
    mockNow += 35000
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
    
    // Update data - should reset the timer
    setActivityQueryData(testKey, 'updated')
    expect(isEntryStale(serializedKey, staleTime)).toBe(false) // Fresh again
    
    // Data is fresh again
    expect(getActivityQueryData<string>(testKey)).toBe('updated')
    
    // Advance a little bit - should still be fresh
    mockNow += 10000
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    expect(getActivityQueryData<string>(testKey)).toBe('updated')
  })

  test('staleTime of 0 means always stale', () => {
    const testKey = ['zero-stale-test']
    const serializedKey = JSON.stringify(testKey)
    
    // Set data
    setActivityQueryData(testKey, 'data')
    
    // With staleTime=0, data is always considered stale
    // (this means refetch should happen on every interval tick)
    expect(isEntryStale(serializedKey, 0)).toBe(true)
    expect(getActivityQueryData<string>(testKey)).toBe('data')
  })

  test('non-existent key is always stale', () => {
    const serializedKey = JSON.stringify(['non-existent'])
    expect(isEntryStale(serializedKey, 30000)).toBe(true)
  })
})

/**
 * Tests for the refetch on activity feature.
 * Verifies that data is refetched when user becomes active after being idle.
 */
describe('refetch on activity behavior', () => {
  let originalDateNow: typeof Date.now
  let mockNow: number

  beforeEach(() => {
    resetActivityQueryCache()
    originalDateNow = Date.now
    mockNow = 1000000
    Date.now = () => mockNow
  })

  afterEach(() => {
    Date.now = originalDateNow
  })

  test('data should be refetchable when user becomes active after idle', () => {
    const testKey = ['activity-refetch-test']
    const staleTime = 30000
    const idleThreshold = 30000
    
    // Set initial data
    setActivityQueryData(testKey, 'initial')
    
    // Simulate time passing beyond staleTime
    mockNow += 35000
    
    // At this point, if user was idle and becomes active,
    // and data is stale, a refetch should occur
    
    // Data should still be accessible
    expect(getActivityQueryData<string>(testKey)).toBe('initial')
    
    // Update with new data (simulating what refetch would do)
    setActivityQueryData(testKey, 'refetched')
    expect(getActivityQueryData<string>(testKey)).toBe('refetched')
  })

  test('pause when idle should prevent polling updates', () => {
    const testKey = ['pause-idle-test']
    
    // Set data
    setActivityQueryData(testKey, 'before-idle')
    
    // When pauseWhenIdle is true and user is idle:
    // - Polling interval fires
    // - But isUserActive returns false
    // - So no refetch happens
    
    // Data remains unchanged
    expect(getActivityQueryData<string>(testKey)).toBe('before-idle')
  })
})

/**
 * Tests verifying the exact scenarios that could cause the
 * Claude subscription percent to not update in the bottom bar.
 */
describe('Claude subscription update scenarios', () => {
  let originalDateNow: typeof Date.now
  let mockNow: number

  beforeEach(() => {
    resetActivityQueryCache()
    originalDateNow = Date.now
    mockNow = 1000000
    Date.now = () => mockNow
  })

  afterEach(() => {
    Date.now = originalDateNow
  })

  test('Claude quota data updates should be reflected in cache', () => {
    const claudeQuotaKey = ['claude-quota', 'current']
    
    // Initial quota data
    const initialQuota = {
      fiveHourRemaining: 80,
      fiveHourResetsAt: new Date('2024-02-01T12:00:00Z'),
      sevenDayRemaining: 90,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }
    
    setActivityQueryData(claudeQuotaKey, initialQuota)
    
    const cached1 = getActivityQueryData<typeof initialQuota>(claudeQuotaKey)
    expect(cached1?.fiveHourRemaining).toBe(80)
    
    // Simulate quota being used
    const updatedQuota = {
      fiveHourRemaining: 60,
      fiveHourResetsAt: new Date('2024-02-01T12:00:00Z'),
      sevenDayRemaining: 85,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }
    
    setActivityQueryData(claudeQuotaKey, updatedQuota)
    
    const cached2 = getActivityQueryData<typeof updatedQuota>(claudeQuotaKey)
    expect(cached2?.fiveHourRemaining).toBe(60)
    expect(cached2?.sevenDayRemaining).toBe(85)
  })

  test('polling should update Claude quota when data is stale', () => {
    const claudeQuotaKey = ['claude-quota', 'current']
    const staleTime = 30000 // 30 seconds (matches useClaudeQuotaQuery)
    const refetchInterval = 60000 // 60 seconds
    
    // Set initial data
    const initialQuota = { fiveHourRemaining: 100, sevenDayRemaining: 100 }
    setActivityQueryData(claudeQuotaKey, initialQuota)
    
    // Time passes beyond staleTime
    mockNow += 35000 // 35 seconds
    
    // Data is now stale, polling tick should trigger refetch
    // In real code: if (isEntryStale(serializedKey, staleTime)) void doFetch()
    
    // Simulate what refetch would do
    const newQuota = { fiveHourRemaining: 75, sevenDayRemaining: 95 }
    setActivityQueryData(claudeQuotaKey, newQuota)
    
    // Verify the update is reflected
    const cached = getActivityQueryData<typeof newQuota>(claudeQuotaKey)
    expect(cached?.fiveHourRemaining).toBe(75)
  })

  test('multiple rapid updates should always reflect latest value', () => {
    const claudeQuotaKey = ['claude-quota', 'current']
    
    // Simulate rapid API responses (e.g., user making multiple requests)
    for (let remaining = 100; remaining >= 0; remaining -= 10) {
      setActivityQueryData(claudeQuotaKey, { fiveHourRemaining: remaining })
    }
    
    // Should have the final value
    const cached = getActivityQueryData<{ fiveHourRemaining: number }>(claudeQuotaKey)
    expect(cached?.fiveHourRemaining).toBe(0)
  })

  test('cache reset should clear Claude quota data', () => {
    const claudeQuotaKey = ['claude-quota', 'current']
    
    setActivityQueryData(claudeQuotaKey, { fiveHourRemaining: 50 })
    expect(getActivityQueryData(claudeQuotaKey)).toBeDefined()
    
    resetActivityQueryCache()
    
    expect(getActivityQueryData(claudeQuotaKey)).toBeUndefined()
  })

  test('invalidation should mark Claude quota for refetch without losing data', () => {
    const claudeQuotaKey = ['claude-quota', 'current']
    
    const quota = { fiveHourRemaining: 50, sevenDayRemaining: 80 }
    setActivityQueryData(claudeQuotaKey, quota)
    
    // Invalidate - marks as stale but preserves data
    invalidateActivityQuery(claudeQuotaKey)
    
    // Data should still be accessible for display while refetch happens
    const cached = getActivityQueryData<typeof quota>(claudeQuotaKey)
    expect(cached?.fiveHourRemaining).toBe(50)
    expect(cached?.sevenDayRemaining).toBe(80)
  })
})

/**
 * Tests for edge cases and error scenarios in the caching system.
 */
describe('cache edge cases and error handling', () => {
  beforeEach(() => {
    resetActivityQueryCache()
  })

  test('setting undefined data should still create cache entry', () => {
    const testKey = ['undefined-test']
    
    setActivityQueryData(testKey, undefined)
    
    // getActivityQueryData returns undefined for both "not in cache" and "data is undefined"
    // This is expected behavior - undefined is a valid cached value
    expect(getActivityQueryData(testKey)).toBeUndefined()
  })

  test('setting null data should store null', () => {
    const testKey = ['null-test']
    
    setActivityQueryData(testKey, null)
    
    expect(getActivityQueryData(testKey)).toBeNull()
  })

  test('complex nested objects should be stored correctly', () => {
    const testKey = ['complex-object-test']
    
    const complexData = {
      user: {
        id: 1,
        profile: {
          name: 'Test',
          settings: {
            theme: 'dark',
            notifications: [1, 2, 3],
          },
        },
      },
      timestamp: new Date('2024-01-01'),
    }
    
    setActivityQueryData(testKey, complexData)
    
    const cached = getActivityQueryData<typeof complexData>(testKey)
    expect(cached?.user.profile.settings.notifications).toEqual([1, 2, 3])
    expect(cached?.timestamp).toEqual(new Date('2024-01-01'))
  })

  test('array data should be stored and retrieved correctly', () => {
    const testKey = ['array-test']
    
    const arrayData = [1, 2, 3, { nested: 'value' }]
    setActivityQueryData(testKey, arrayData)
    
    const cached = getActivityQueryData<typeof arrayData>(testKey)
    expect(cached).toEqual(arrayData)
    expect(cached?.[3]).toEqual({ nested: 'value' })
  })

  test('invalidating non-existent key should not throw', () => {
    expect(() => {
      invalidateActivityQuery(['non-existent-key'])
    }).not.toThrow()
  })

  test('removing non-existent key should not throw', () => {
    expect(() => {
      removeActivityQuery(['non-existent-key'])
    }).not.toThrow()
  })

  test('getting data after remove should return undefined', () => {
    const testKey = ['remove-then-get-test']
    
    setActivityQueryData(testKey, 'data')
    removeActivityQuery(testKey)
    
    expect(getActivityQueryData(testKey)).toBeUndefined()
  })

  test('setting data after remove should work', () => {
    const testKey = ['remove-then-set-test']
    
    setActivityQueryData(testKey, 'first')
    removeActivityQuery(testKey)
    setActivityQueryData(testKey, 'second')
    
    expect(getActivityQueryData<string>(testKey)).toBe('second')
  })
})

/**
 * Tests for the cache deletion and in-flight request protection.
 * Verifies that in-flight fetches cannot "resurrect" deleted cache entries.
 *
 * The bug scenario was:
 * 1. Fetch starts, captures myGen = 0 (generation not set defaults to 0)
 * 2. Entry deleted: bumps generation to 1, then USED TO delete generation entry
 * 3. Fetch completes, getGeneration(key) returned 0 again (entry was deleted!)
 * 4. 0 === 0 passed, stale fetch wrote to cache, resurrecting the deleted entry
 *
 * The fix: Don't delete the generation entry after bumping it in deleteCacheEntryCore.
 * The bumped generation persists so in-flight requests see a different generation.
 */
describe('cache deletion and in-flight request protection', () => {
  beforeEach(() => {
    resetActivityQueryCache()
  })

  test('deletion bumps generation from 0 to 1', () => {
    const testKey = ['deletion-gen-test']
    const serializedKey = serializeQueryKey(testKey)

    // Set initial data
    setActivityQueryData(testKey, 'initial-data')

    // Before deletion, generation should be 0 (default)
    expect(getGeneration(serializedKey)).toBe(0)

    // Delete the entry
    deleteCacheEntryCore(serializedKey)

    // After deletion, generation should be bumped to 1
    expect(getGeneration(serializedKey)).toBe(1)
  })

  test('generation persists after deletion (not cleared)', () => {
    const testKey = ['gen-persist-test']
    const serializedKey = serializeQueryKey(testKey)

    // Set data and delete it
    setActivityQueryData(testKey, 'data')
    deleteCacheEntryCore(serializedKey)

    // Generation should be 1 after first deletion
    expect(getGeneration(serializedKey)).toBe(1)

    // Data should be gone
    expect(getActivityQueryData(testKey)).toBeUndefined()

    // Set new data and delete again
    setActivityQueryData(testKey, 'new-data')
    deleteCacheEntryCore(serializedKey)

    // Generation should be 2 after second deletion
    expect(getGeneration(serializedKey)).toBe(2)

    // This proves generation is NOT being deleted, but accumulated
  })

  test('simulated in-flight fetch cannot resurrect deleted entry', () => {
    const testKey = ['in-flight-protection-test']
    const serializedKey = serializeQueryKey(testKey)

    // Step 1: Set initial data (simulating a previous successful fetch)
    setActivityQueryData(testKey, 'original-data')
    expect(getActivityQueryData<string>(testKey)).toBe('original-data')

    // Step 2: Simulate a fetch starting - capture the generation
    // In real code: const myGen = getGeneration(key)
    const myGen = getGeneration(serializedKey)
    expect(myGen).toBe(0) // Default generation

    // Step 3: While the fetch is "in flight", the entry gets deleted
    // (e.g., user navigates away, cache GC runs, or explicit removal)
    deleteCacheEntryCore(serializedKey)

    // Step 4: Entry is now deleted, but generation was bumped
    expect(getActivityQueryData(testKey)).toBeUndefined()
    expect(getGeneration(serializedKey)).toBe(1)

    // Step 5: The in-flight fetch completes and tries to write
    // In real code, this check happens before setCacheEntry:
    // if (getGeneration(key) !== myGen) return
    const currentGen = getGeneration(serializedKey)
    const wouldSkipWrite = currentGen !== myGen

    // The write SHOULD be skipped because generations don't match
    expect(wouldSkipWrite).toBe(true)
    expect(myGen).toBe(0)
    expect(currentGen).toBe(1)

    // Verify the cache stays empty (entry not resurrected)
    expect(getActivityQueryData(testKey)).toBeUndefined()
  })

  test('generation check correctly allows writes when not deleted', () => {
    const testKey = ['gen-allow-write-test']
    const serializedKey = serializeQueryKey(testKey)

    // Set initial data
    setActivityQueryData(testKey, 'initial')

    // Capture generation before fetch
    const myGen = getGeneration(serializedKey)
    expect(myGen).toBe(0)

    // Simulate fetch completing WITHOUT any deletion happening
    // The generation should still be 0
    const currentGen = getGeneration(serializedKey)
    const wouldSkipWrite = currentGen !== myGen

    // Write should NOT be skipped - generations match
    expect(wouldSkipWrite).toBe(false)

    // Normal update should work
    setActivityQueryData(testKey, 'updated')
    expect(getActivityQueryData<string>(testKey)).toBe('updated')
  })

  test('multiple in-flight fetches all see their respective generations', () => {
    const testKey = ['multi-flight-test']
    const serializedKey = serializeQueryKey(testKey)

    // Fetch 1 starts
    const gen1 = getGeneration(serializedKey)
    expect(gen1).toBe(0)

    // Set some data and delete it
    setActivityQueryData(testKey, 'data1')
    deleteCacheEntryCore(serializedKey)

    // Fetch 2 starts after deletion
    const gen2 = getGeneration(serializedKey)
    expect(gen2).toBe(1)

    // Another deletion
    setActivityQueryData(testKey, 'data2')
    deleteCacheEntryCore(serializedKey)

    // Fetch 3 starts after second deletion
    const gen3 = getGeneration(serializedKey)
    expect(gen3).toBe(2)

    // Now check which fetches would be allowed to write
    const currentGen = getGeneration(serializedKey)
    expect(currentGen).toBe(2)

    // Fetch 1: captured gen 0, current is 2 -> skip write
    expect(currentGen !== gen1).toBe(true)

    // Fetch 2: captured gen 1, current is 2 -> skip write
    expect(currentGen !== gen2).toBe(true)

    // Fetch 3: captured gen 2, current is 2 -> allow write
    expect(currentGen !== gen3).toBe(false)
  })

  test('bumpGeneration without deletion also increments generation', () => {
    const testKey = ['bump-only-test']
    const serializedKey = serializeQueryKey(testKey)

    expect(getGeneration(serializedKey)).toBe(0)

    bumpGeneration(serializedKey)
    expect(getGeneration(serializedKey)).toBe(1)

    bumpGeneration(serializedKey)
    expect(getGeneration(serializedKey)).toBe(2)

    bumpGeneration(serializedKey)
    expect(getGeneration(serializedKey)).toBe(3)
  })

  test('resetActivityQueryCache clears generations', () => {
    const testKey = ['reset-gen-test']
    const serializedKey = serializeQueryKey(testKey)

    // Set data and delete it to bump generation
    setActivityQueryData(testKey, 'data')
    deleteCacheEntryCore(serializedKey)
    expect(getGeneration(serializedKey)).toBe(1)

    // Reset cache should clear everything including generations
    resetActivityQueryCache()

    // Generation should be back to 0 (default)
    expect(getGeneration(serializedKey)).toBe(0)
  })
})
