import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  serializeQueryKey,
  subscribeToKey,
  getKeySnapshot,
  setCacheEntry,
  getCacheEntry,
  isEntryStale,
  setQueryFetching,
  isQueryFetching,
  incrementRefCount,
  decrementRefCount,
  getRefCount,
  bumpGeneration,
  getGeneration,
  deleteCacheEntryCore,
  setGcTimeout,
  clearGcTimeout,
  resetCache,
  type CacheEntry,
} from '../query-cache'

describe('serializeQueryKey', () => {
  test('serializes simple array', () => {
    expect(serializeQueryKey(['users'])).toBe('["users"]')
  })

  test('serializes array with multiple elements', () => {
    expect(serializeQueryKey(['users', 1, 'posts'])).toBe('["users",1,"posts"]')
  })

  test('serializes array with objects', () => {
    expect(serializeQueryKey(['query', { page: 1, sort: 'asc' }])).toBe(
      '["query",{"page":1,"sort":"asc"}]',
    )
  })

  test('serializes nested objects', () => {
    expect(serializeQueryKey(['data', { filter: { status: 'active' } }])).toBe(
      '["data",{"filter":{"status":"active"}}]',
    )
  })

  test('same values produce same serialization', () => {
    const key1 = serializeQueryKey(['users', 1])
    const key2 = serializeQueryKey(['users', 1])
    expect(key1).toBe(key2)
  })

  test('different values produce different serialization', () => {
    const key1 = serializeQueryKey(['users', 1])
    const key2 = serializeQueryKey(['users', 2])
    expect(key1).not.toBe(key2)
  })
})

describe('subscribeToKey', () => {
  beforeEach(() => {
    resetCache()
  })

  test('subscriber is called when cache entry is set', () => {
    const key = 'test-key'
    let callCount = 0

    subscribeToKey(key, () => {
      callCount++
    })

    setCacheEntry(key, {
      data: 'value',
      dataUpdatedAt: Date.now(),
      error: null,
      errorUpdatedAt: null,
    })

    expect(callCount).toBe(1)
  })

  test('subscriber is called on each update', () => {
    const key = 'test-key'
    let callCount = 0

    subscribeToKey(key, () => {
      callCount++
    })

    setCacheEntry(key, { data: 'first', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    setCacheEntry(key, { data: 'second', dataUpdatedAt: 2, error: null, errorUpdatedAt: null })
    setCacheEntry(key, { data: 'third', dataUpdatedAt: 3, error: null, errorUpdatedAt: null })

    expect(callCount).toBe(3)
  })

  test('unsubscribe stops notifications', () => {
    const key = 'test-key'
    let callCount = 0

    const unsubscribe = subscribeToKey(key, () => {
      callCount++
    })

    setCacheEntry(key, { data: 'first', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    expect(callCount).toBe(1)

    unsubscribe()

    setCacheEntry(key, { data: 'second', dataUpdatedAt: 2, error: null, errorUpdatedAt: null })
    expect(callCount).toBe(1) // No additional calls
  })

  test('multiple subscribers all receive notifications', () => {
    const key = 'test-key'
    let count1 = 0
    let count2 = 0

    subscribeToKey(key, () => {
      count1++
    })
    subscribeToKey(key, () => {
      count2++
    })

    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })

  test('subscriber notified when fetching state changes', () => {
    const key = 'test-key'
    let callCount = 0

    subscribeToKey(key, () => {
      callCount++
    })

    setQueryFetching(key, true)
    expect(callCount).toBe(1)

    setQueryFetching(key, false)
    expect(callCount).toBe(2)
  })

  test('subscriber notified when entry is deleted', () => {
    const key = 'test-key'
    let callCount = 0

    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    subscribeToKey(key, () => {
      callCount++
    })

    deleteCacheEntryCore(key)
    expect(callCount).toBe(1)
  })
})

describe('getKeySnapshot', () => {
  beforeEach(() => {
    resetCache()
  })

  test('returns undefined entry for non-existent key', () => {
    const snapshot = getKeySnapshot('non-existent')
    expect(snapshot.entry).toBeUndefined()
    expect(snapshot.isFetching).toBe(false)
  })

  test('returns entry and fetching status', () => {
    const key = 'test-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    setQueryFetching(key, true)

    const snapshot = getKeySnapshot<string>(key)
    expect(snapshot.entry?.data).toBe('value')
    expect(snapshot.isFetching).toBe(true)
  })

  test('returns same reference for unchanged snapshot (memoization)', () => {
    const key = 'test-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    const snapshot1 = getKeySnapshot(key)
    const snapshot2 = getKeySnapshot(key)

    expect(snapshot1).toBe(snapshot2) // Same reference
  })

  test('returns new reference when entry changes', () => {
    const key = 'test-key'
    setCacheEntry(key, { data: 'value1', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    const snapshot1 = getKeySnapshot(key)

    setCacheEntry(key, { data: 'value2', dataUpdatedAt: 2, error: null, errorUpdatedAt: null })

    const snapshot2 = getKeySnapshot(key)

    expect(snapshot1).not.toBe(snapshot2)
  })

  test('returns new reference when fetching status changes', () => {
    const key = 'test-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    const snapshot1 = getKeySnapshot(key)

    setQueryFetching(key, true)

    const snapshot2 = getKeySnapshot(key)

    expect(snapshot1).not.toBe(snapshot2)
    expect(snapshot1.isFetching).toBe(false)
    expect(snapshot2.isFetching).toBe(true)
  })
})

describe('setCacheEntry / getCacheEntry', () => {
  beforeEach(() => {
    resetCache()
  })

  test('sets and retrieves a cache entry', () => {
    const key = 'test-key'
    const entry: CacheEntry<string> = {
      data: 'hello',
      dataUpdatedAt: Date.now(),
      error: null,
      errorUpdatedAt: null,
    }

    setCacheEntry(key, entry)
    const retrieved = getCacheEntry<string>(key)

    expect(retrieved?.data).toBe('hello')
  })

  test('returns undefined for non-existent key', () => {
    expect(getCacheEntry('non-existent')).toBeUndefined()
  })

  test('overwrites existing entry', () => {
    const key = 'test-key'

    setCacheEntry(key, { data: 'first', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    setCacheEntry(key, { data: 'second', dataUpdatedAt: 2, error: null, errorUpdatedAt: null })

    expect(getCacheEntry<string>(key)?.data).toBe('second')
  })

  test('stores error-only entries', () => {
    const key = 'error-key'
    const error = new Error('Failed')

    setCacheEntry(key, {
      data: undefined,
      dataUpdatedAt: 0,
      error,
      errorUpdatedAt: Date.now(),
    })

    const retrieved = getCacheEntry(key)
    expect(retrieved?.data).toBeUndefined()
    expect(retrieved?.error).toBe(error)
  })

  test('stores entry with both data and error', () => {
    const key = 'mixed-key'
    const error = new Error('Refresh failed')

    setCacheEntry(key, {
      data: 'stale-data',
      dataUpdatedAt: 1000,
      error,
      errorUpdatedAt: 2000,
    })

    const retrieved = getCacheEntry<string>(key)
    expect(retrieved?.data).toBe('stale-data')
    expect(retrieved?.error).toBe(error)
  })
})

describe('isEntryStale', () => {
  let originalDateNow: typeof Date.now
  let mockNow: number

  beforeEach(() => {
    resetCache()
    originalDateNow = Date.now
    mockNow = 1000000
    Date.now = () => mockNow
  })

  afterEach(() => {
    Date.now = originalDateNow
  })

  test('non-existent entry is always stale', () => {
    expect(isEntryStale('non-existent', 30000)).toBe(true)
  })

  test('entry with dataUpdatedAt=0 is always stale', () => {
    const key = 'stale-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 0, error: null, errorUpdatedAt: null })
    expect(isEntryStale(key, 30000)).toBe(true)
  })

  test('staleTime=0 means always stale', () => {
    const key = 'fresh-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: mockNow, error: null, errorUpdatedAt: null })
    expect(isEntryStale(key, 0)).toBe(true)
  })

  test('fresh entry is not stale', () => {
    const key = 'fresh-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: mockNow, error: null, errorUpdatedAt: null })
    expect(isEntryStale(key, 30000)).toBe(false)
  })

  test('entry becomes stale after staleTime passes', () => {
    const key = 'aging-key'
    const staleTime = 30000

    setCacheEntry(key, { data: 'value', dataUpdatedAt: mockNow, error: null, errorUpdatedAt: null })
    expect(isEntryStale(key, staleTime)).toBe(false)

    // Advance time past staleTime
    mockNow += 35000
    expect(isEntryStale(key, staleTime)).toBe(true)
  })

  test('entry just at staleTime boundary is not stale', () => {
    const key = 'boundary-key'
    const staleTime = 30000

    setCacheEntry(key, { data: 'value', dataUpdatedAt: mockNow, error: null, errorUpdatedAt: null })

    // Advance time exactly to staleTime
    mockNow += 30000
    expect(isEntryStale(key, staleTime)).toBe(false)

    // One ms past is stale
    mockNow += 1
    expect(isEntryStale(key, staleTime)).toBe(true)
  })
})

describe('setQueryFetching / isQueryFetching', () => {
  beforeEach(() => {
    resetCache()
  })

  test('defaults to not fetching', () => {
    expect(isQueryFetching('any-key')).toBe(false)
  })

  test('sets fetching state to true', () => {
    setQueryFetching('key', true)
    expect(isQueryFetching('key')).toBe(true)
  })

  test('sets fetching state to false', () => {
    setQueryFetching('key', true)
    setQueryFetching('key', false)
    expect(isQueryFetching('key')).toBe(false)
  })

  test('different keys have independent fetching state', () => {
    setQueryFetching('key1', true)
    setQueryFetching('key2', false)

    expect(isQueryFetching('key1')).toBe(true)
    expect(isQueryFetching('key2')).toBe(false)
  })

  test('setting same value does not trigger notification', () => {
    const key = 'test-key'
    let callCount = 0

    setQueryFetching(key, true)
    subscribeToKey(key, () => {
      callCount++
    })

    // Setting to same value should not notify
    setQueryFetching(key, true)
    expect(callCount).toBe(0)

    // Changing value should notify
    setQueryFetching(key, false)
    expect(callCount).toBe(1)
  })
})

describe('incrementRefCount / decrementRefCount / getRefCount', () => {
  beforeEach(() => {
    resetCache()
  })

  test('ref count defaults to 0', () => {
    expect(getRefCount('any-key')).toBe(0)
  })

  test('incrementRefCount increases count', () => {
    incrementRefCount('key')
    expect(getRefCount('key')).toBe(1)

    incrementRefCount('key')
    expect(getRefCount('key')).toBe(2)
  })

  test('decrementRefCount decreases count', () => {
    incrementRefCount('key')
    incrementRefCount('key')
    incrementRefCount('key')

    decrementRefCount('key')
    expect(getRefCount('key')).toBe(2)

    decrementRefCount('key')
    expect(getRefCount('key')).toBe(1)
  })

  test('decrementRefCount clamps to 0', () => {
    expect(decrementRefCount('key')).toBe(0)
    expect(decrementRefCount('key')).toBe(0) // Can't go negative
    expect(getRefCount('key')).toBe(0)
  })

  test('decrementRefCount returns the new count', () => {
    incrementRefCount('key')
    incrementRefCount('key')
    incrementRefCount('key')

    expect(decrementRefCount('key')).toBe(2)
    expect(decrementRefCount('key')).toBe(1)
    expect(decrementRefCount('key')).toBe(0)
  })

  test('different keys have independent ref counts', () => {
    incrementRefCount('key1')
    incrementRefCount('key1')
    incrementRefCount('key2')

    expect(getRefCount('key1')).toBe(2)
    expect(getRefCount('key2')).toBe(1)
  })
})

describe('bumpGeneration / getGeneration', () => {
  beforeEach(() => {
    resetCache()
  })

  test('generation defaults to 0', () => {
    expect(getGeneration('any-key')).toBe(0)
  })

  test('bumpGeneration increments generation', () => {
    bumpGeneration('key')
    expect(getGeneration('key')).toBe(1)

    bumpGeneration('key')
    expect(getGeneration('key')).toBe(2)

    bumpGeneration('key')
    expect(getGeneration('key')).toBe(3)
  })

  test('different keys have independent generations', () => {
    bumpGeneration('key1')
    bumpGeneration('key1')
    bumpGeneration('key2')

    expect(getGeneration('key1')).toBe(2)
    expect(getGeneration('key2')).toBe(1)
  })
})

describe('deleteCacheEntryCore', () => {
  beforeEach(() => {
    resetCache()
  })

  test('deletes cache entry', () => {
    const key = 'delete-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    deleteCacheEntryCore(key)

    expect(getCacheEntry(key)).toBeUndefined()
  })

  test('clears fetching state', () => {
    const key = 'delete-key'
    setQueryFetching(key, true)

    deleteCacheEntryCore(key)

    expect(isQueryFetching(key)).toBe(false)
  })

  test('clears ref count', () => {
    const key = 'delete-key'
    incrementRefCount(key)
    incrementRefCount(key)

    deleteCacheEntryCore(key)

    expect(getRefCount(key)).toBe(0)
  })

  test('bumps generation', () => {
    const key = 'delete-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    expect(getGeneration(key)).toBe(0)

    deleteCacheEntryCore(key)

    expect(getGeneration(key)).toBe(1)
  })

  test('generation persists after deletion (prevents resurrecting deleted entries)', () => {
    const key = 'persist-gen-key'

    // First deletion
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    deleteCacheEntryCore(key)
    expect(getGeneration(key)).toBe(1)

    // Entry is gone but generation remains
    expect(getCacheEntry(key)).toBeUndefined()

    // Second set and delete
    setCacheEntry(key, { data: 'value2', dataUpdatedAt: 2, error: null, errorUpdatedAt: null })
    deleteCacheEntryCore(key)
    expect(getGeneration(key)).toBe(2)
  })

  test('notifies subscribers when deleting', () => {
    const key = 'notify-delete-key'
    let notified = false

    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    subscribeToKey(key, () => {
      notified = true
    })

    deleteCacheEntryCore(key)

    expect(notified).toBe(true)
  })

  test('deleting non-existent key still bumps generation', () => {
    const key = 'non-existent-key'
    expect(getGeneration(key)).toBe(0)

    deleteCacheEntryCore(key)

    expect(getGeneration(key)).toBe(1)
  })
})

describe('setGcTimeout / clearGcTimeout', () => {
  beforeEach(() => {
    resetCache()
  })

  test('clearGcTimeout clears a pending timeout', () => {
    const key = 'gc-key'
    let timeoutFired = false

    const timeoutId = setTimeout(() => {
      timeoutFired = true
    }, 10)

    setGcTimeout(key, timeoutId)
    clearGcTimeout(key)

    // Wait a bit to ensure timeout would have fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(timeoutFired).toBe(false)
        resolve()
      }, 50)
    })
  })

  test('clearGcTimeout on non-existent key does not throw', () => {
    expect(() => clearGcTimeout('non-existent')).not.toThrow()
  })

  test('resetCache clears all GC timeouts', () => {
    const key = 'gc-key'
    let timeoutFired = false

    const timeoutId = setTimeout(() => {
      timeoutFired = true
    }, 10)

    setGcTimeout(key, timeoutId)
    resetCache()

    // Wait a bit to ensure timeout would have fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(timeoutFired).toBe(false)
        resolve()
      }, 50)
    })
  })
})

describe('resetCache', () => {
  beforeEach(() => {
    resetCache()
  })

  test('clears all cache entries', () => {
    setCacheEntry('key1', { data: 'v1', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    setCacheEntry('key2', { data: 'v2', dataUpdatedAt: 2, error: null, errorUpdatedAt: null })

    resetCache()

    expect(getCacheEntry('key1')).toBeUndefined()
    expect(getCacheEntry('key2')).toBeUndefined()
  })

  test('clears all ref counts', () => {
    incrementRefCount('key1')
    incrementRefCount('key2')

    resetCache()

    expect(getRefCount('key1')).toBe(0)
    expect(getRefCount('key2')).toBe(0)
  })

  test('clears all fetching states', () => {
    setQueryFetching('key1', true)
    setQueryFetching('key2', true)

    resetCache()

    expect(isQueryFetching('key1')).toBe(false)
    expect(isQueryFetching('key2')).toBe(false)
  })

  test('clears all generations', () => {
    bumpGeneration('key1')
    bumpGeneration('key2')

    resetCache()

    expect(getGeneration('key1')).toBe(0)
    expect(getGeneration('key2')).toBe(0)
  })

  test('clears snapshot memoization', () => {
    const key = 'memo-key'
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })

    const snapshot1 = getKeySnapshot(key)

    resetCache()

    // After reset, new entry should create a new snapshot
    setCacheEntry(key, { data: 'value', dataUpdatedAt: 1, error: null, errorUpdatedAt: null })
    const snapshot2 = getKeySnapshot(key)

    // These should NOT be the same reference (memo was cleared)
    expect(snapshot1.entry).not.toBe(snapshot2.entry)
  })
})
