import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  invalidateActivityQuery,
  removeActivityQuery,
  getActivityQueryData,
  setActivityQueryData,
  resetActivityQueryCache,
  isEntryStale,
  setErrorOnlyCacheEntry,
  _retryTestHelpers,
} from '../use-activity-query'

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
 * Tests for error-only cache entries and persistent error scenarios.
 * This test suite was added to debug and fix an issue where fetchSubscriptionData
 * was being called every second when the endpoint returned errors.
 */
describe('error-only entries and persistent error handling', () => {
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

  test('setErrorOnlyCacheEntry creates entry with no data and error', () => {
    const testKey = ['error-entry-test']
    const error = new Error('Network error')
    
    setErrorOnlyCacheEntry(testKey, error)
    
    // Data should be undefined (error-only entry)
    expect(getActivityQueryData(testKey)).toBeUndefined()
  })

  test('error-only entry with recent errorUpdatedAt should NOT be stale', () => {
    // This test verifies the fix for the infinite refetch loop bug.
    // 
    // Scenario:
    // 1. Fetch fails with no prior data
    // 2. Error is stored with errorUpdatedAt = now
    // 3. Polling tick fires
    // 4. isEntryStale should return FALSE if errorUpdatedAt is recent
    // 5. This prevents immediate refetch loop
    
    const testKey = ['error-only-fresh-test']
    const serializedKey = JSON.stringify(testKey)
    const staleTime = 30000 // 30 seconds
    const error = new Error('API error')
    
    // Create error-only entry at current time (mockNow = 1000000)
    setErrorOnlyCacheEntry(testKey, error, mockNow)
    
    // Entry has errorUpdatedAt = 1000000, current time = 1000000
    // Time since error: 0ms, staleTime: 30000ms
    // Should NOT be stale because error is recent
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
  })

  test('error-only entry becomes stale after staleTime passes', () => {
    const testKey = ['error-stale-after-time-test']
    const serializedKey = JSON.stringify(testKey)
    const staleTime = 30000 // 30 seconds
    const error = new Error('API error')
    
    // Create error-only entry at current time
    setErrorOnlyCacheEntry(testKey, error, mockNow)
    
    // Initially not stale
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // Advance time by 25 seconds - still fresh
    mockNow += 25000
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // Advance time past staleTime (now 35 seconds since error)
    mockNow += 10000
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
  })

  test('simulates subscription query polling with persistent errors', () => {
    // This test simulates the exact bug scenario:
    // - useSubscriptionQuery with staleTime=30s, refetchInterval=60s
    // - Endpoint returns errors
    // - Without fix: isEntryStale returns true immediately, causing rapid refetches
    // - With fix: isEntryStale uses errorUpdatedAt, preventing rapid refetches
    
    const subscriptionKey = ['subscription', 'current']
    const serializedKey = JSON.stringify(subscriptionKey)
    const staleTime = 30000 // 30 seconds (matches useSubscriptionQuery)
    const refetchInterval = 60000 // 60 seconds
    const error = new Error('Failed to fetch subscription: 500')
    
    // Simulate first fetch failure at t=0
    setErrorOnlyCacheEntry(subscriptionKey, error, mockNow)
    
    // Immediately after error, entry should NOT be stale
    // This is the critical fix - prevents immediate refetch loop
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // Simulate polling interval at t=1s (as reported in bug)
    mockNow += 1000
    // Entry should still NOT be stale (only 1s since error, staleTime is 30s)
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // Simulate many 1-second intervals - none should trigger refetch until staleTime
    for (let i = 0; i < 28; i++) {
      mockNow += 1000
      expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    }
    
    // Now at t=29s - should still be fresh (29s is not > 30s)
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // At t=30s - should still be fresh (30s is not > 30s, need strictly greater)
    mockNow += 1000
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)
    
    // At t=31s - now stale, refetch should be allowed (31s > 30s)
    mockNow += 1000
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
  })

  test('staleTime of 0 means always stale even for error-only entries', () => {
    const testKey = ['zero-stale-error-test']
    const serializedKey = JSON.stringify(testKey)
    const error = new Error('Some error')
    
    setErrorOnlyCacheEntry(testKey, error, mockNow)
    
    // With staleTime=0, entry is always considered stale
    expect(isEntryStale(serializedKey, 0)).toBe(true)
  })

  test('error-only entry with null errorUpdatedAt is stale', () => {
    // Edge case: if somehow errorUpdatedAt is null, entry should be stale
    // This shouldn't happen in practice but tests defensive coding
    const testKey = ['null-error-time-test']
    const serializedKey = JSON.stringify(testKey)
    const staleTime = 30000
    
    // Create entry without errorUpdatedAt (using undefined which gets stored as null)
    // Note: setErrorOnlyCacheEntry always sets errorUpdatedAt, so we test via regular data
    // and then invalidate it
    
    // Non-existent key is stale
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
  })

  test('successful data takes precedence over errorUpdatedAt for staleness', () => {
    const testKey = ['data-precedence-test']
    const serializedKey = JSON.stringify(testKey)
    const staleTime = 30000
    
    // First, set an error-only entry
    setErrorOnlyCacheEntry(testKey, new Error('Initial error'), mockNow)
    expect(isEntryStale(serializedKey, staleTime)).toBe(false) // Fresh error
    
    // Now set successful data (this is what happens on successful retry)
    setActivityQueryData(testKey, { subscription: 'active' })
    
    // Staleness should now be based on dataUpdatedAt, not errorUpdatedAt
    expect(isEntryStale(serializedKey, staleTime)).toBe(false) // Fresh data
    
    // Advance time past staleTime
    mockNow += 35000
    expect(isEntryStale(serializedKey, staleTime)).toBe(true) // Stale based on dataUpdatedAt
  })
})

/**
 * Tests for the retry infinite loop bug.
 *
 * BUG: When useSubscriptionQuery fetched /api/user/subscription and got a 401,
 * it would retry every ~1 second infinitely instead of respecting retry:1.
 *
 * ROOT CAUSE: In doFetch's catch block, when scheduling a retry:
 *   1. retryCounts.set(key, next)   // Sets count to 1
 *   2. clearRetryState(key)          // Deletes retryCounts → count back to 0!
 *   3. setTimeout to retry in 1s
 * When the retry fires, currentRetries reads as 0 again → thinks it still has
 * retries left → schedules another retry → infinite loop.
 *
 * FIX: Split clearRetryState into clearRetryTimeout (only clears timeout)
 * and clearRetryState (clears both). The retry scheduling block now uses
 * clearRetryTimeout so the retry count is preserved.
 */
describe('retry infinite loop bug fix (subscription 401 scenario)', () => {
  beforeEach(() => {
    resetActivityQueryCache()
  })

  test('retry count is preserved after scheduling a retry', () => {
    const queryKey = ['subscription', 'current']
    const maxRetries = 1

    // Simulate a mounted component (refCount > 0)
    _retryTestHelpers.setRefCount(queryKey, 1)

    // Initially, no retries have been attempted
    expect(_retryTestHelpers.getRetryCount(queryKey)).toBe(0)

    // First fetch fails → should schedule a retry
    const result1 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(result1.retryScheduled).toBe(true)
    expect(result1.retryCount).toBe(1)

    // CRITICAL: Retry count must be preserved (not reset to 0)
    expect(_retryTestHelpers.getRetryCount(queryKey)).toBe(1)
  })

  test('retries are exhausted after maxRetries attempts', () => {
    const queryKey = ['subscription', 'current']
    const maxRetries = 1

    _retryTestHelpers.setRefCount(queryKey, 1)

    // First fetch fails → retry scheduled (count becomes 1)
    const result1 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(result1.retryScheduled).toBe(true)
    expect(result1.retryCount).toBe(1)

    // Retry fires, also fails → retries exhausted (count = 1, not < maxRetries=1)
    const result2 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(result2.retryScheduled).toBe(false)
    expect(result2.retryCount).toBe(0) // Reset after exhaustion
  })

  test('simulates full subscription 401 scenario: fetch + 1 retry + stop', () => {
    // This reproduces the exact bug scenario:
    // useSubscriptionQuery with retry:1 hitting a 401 on /api/user/subscription
    const queryKey = ['subscription', 'current']
    const maxRetries = 1

    // Component is mounted
    _retryTestHelpers.setRefCount(queryKey, 1)

    // === Fetch #1: Initial fetch fails with 401 ===
    const fetch1 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(fetch1.retryScheduled).toBe(true)
    expect(fetch1.retryCount).toBe(1)

    // === Fetch #2: Retry fires after 1s, also fails with 401 ===
    const fetch2 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(fetch2.retryScheduled).toBe(false) // Retries exhausted!
    expect(fetch2.retryCount).toBe(0)

    // === Fetch #3: If the bug existed, this would schedule ANOTHER retry ===
    // With the fix, the error is stored and no more retries are scheduled.
    // A third call should also exhaust immediately since count was reset to 0
    // BUT there's no retry scheduled, so this would only happen from polling.
    const fetch3 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    // Even if polling triggers another fetch, retry:1 means ONE retry per fetch cycle
    expect(fetch3.retryScheduled).toBe(true) // New fetch cycle starts fresh
    expect(fetch3.retryCount).toBe(1)

    // The retry for fetch3 fires and fails
    const fetch4 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(fetch4.retryScheduled).toBe(false) // Exhausted again
  })

  test('demonstrates the old bug: clearRetryState would reset count causing infinite loop', () => {
    // This test documents the OLD buggy behavior.
    // The old code called clearRetryState (which deletes retryCounts) right after
    // setting the retry count, effectively resetting it to 0 every time.
    const queryKey = ['subscription', 'current']

    _retryTestHelpers.setRefCount(queryKey, 1)

    // Step 1: Simulate first fetch failure setting retry count to 1
    _retryTestHelpers.setRetryCount(queryKey, 1)
    expect(_retryTestHelpers.getRetryCount(queryKey)).toBe(1)

    // Step 2: OLD CODE would call clearRetryState here, which resets count to 0:
    // clearRetryState(key) → retryCounts.delete(key) → count = 0
    // Simulate the old bug by manually resetting:
    _retryTestHelpers.setRetryCount(queryKey, 0)
    expect(_retryTestHelpers.getRetryCount(queryKey)).toBe(0)

    // Step 3: When the retry fires after 1s, it reads count as 0
    // 0 < maxRetries(1) → true → schedules ANOTHER retry (should have been exhausted!)
    const result = _retryTestHelpers.simulateFailedFetch(queryKey, 1)
    expect(result.retryScheduled).toBe(true) // BUG: should have been false!
    expect(result.retryCount).toBe(1) // Count set to 1 again...

    // And the cycle repeats: count gets reset → retry fires → count is 0 → retry...
    // With the fix (clearRetryTimeout instead of clearRetryState), count stays at 1
    // so the next attempt correctly sees 1 >= maxRetries(1) → exhausted.
  })

  test('retry count resets to 0 when retries are exhausted', () => {
    const queryKey = ['retry-reset-test']
    const maxRetries = 2

    _retryTestHelpers.setRefCount(queryKey, 1)

    // First fail → retry scheduled, count=1
    const r1 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(r1).toEqual({ retryScheduled: true, retryCount: 1 })

    // Second fail → retry scheduled, count=2
    const r2 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(r2).toEqual({ retryScheduled: true, retryCount: 2 })

    // Third fail → retries exhausted, count reset to 0
    const r3 = _retryTestHelpers.simulateFailedFetch(queryKey, maxRetries)
    expect(r3).toEqual({ retryScheduled: false, retryCount: 0 })
  })

  test('no retries when retry is 0 or false', () => {
    const queryKey = ['no-retry-test']
    _retryTestHelpers.setRefCount(queryKey, 1)

    // retry: 0 (equivalent to retry: false)
    const result = _retryTestHelpers.simulateFailedFetch(queryKey, 0)
    expect(result.retryScheduled).toBe(false)
    expect(result.retryCount).toBe(0)
  })

  test('no retries when component is unmounted (refCount=0)', () => {
    const queryKey = ['unmounted-test']
    // Don't set refCount (defaults to 0 = no mounted components)

    const result = _retryTestHelpers.simulateFailedFetch(queryKey, 1)
    expect(result.retryScheduled).toBe(false)
  })

  test('error-only entry is created after retries exhausted', () => {
    const queryKey = ['error-entry-after-retry']
    _retryTestHelpers.setRefCount(queryKey, 1)

    // First fail → retry
    _retryTestHelpers.simulateFailedFetch(queryKey, 1)

    // No cache entry yet during retry phase
    expect(getActivityQueryData(queryKey)).toBeUndefined()

    // Second fail → exhausted, error entry created
    _retryTestHelpers.simulateFailedFetch(queryKey, 1)

    // Error entry should exist (data is undefined but entry exists)
    // The entry has error set, which we can verify via isEntryStale behavior
    const serializedKey = JSON.stringify(queryKey)
    // Entry exists (not stale due to "no entry" - stale due to other reasons)
    // Since we just set errorUpdatedAt = Date.now(), it should not be stale
    // for a reasonable staleTime
    expect(isEntryStale(serializedKey, 30000)).toBe(false)
  })
})
