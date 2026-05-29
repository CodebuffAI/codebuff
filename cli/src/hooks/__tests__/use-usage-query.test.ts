import { createMockLogger } from '@codebuff/common/testing/mocks/logger'
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

import {
  resetActivityQueryCache,
  getActivityQueryData,
  setActivityQueryData,
  invalidateActivityQuery,
  removeActivityQuery,
} from '../use-activity-query'
import {
  usageQueryKeys,
} from '../use-usage-query'

beforeEach(() => {
  resetActivityQueryCache()
})

describe('fetchUsageData', () => {
  afterEach(() => {
    mock.restore()
  })

  test('should fetch usage data successfully', async () => {
    const { fetchUsageData } = await import('../use-usage-query')
    const mockClient = {
      post: mock(async () => ({
        ok: true,
        status: 200,
        data: {
          usage: 100,
          remainingBalance: 500,
          next_quota_reset: '2024-02-01T00:00:00.000Z',
        },
      })),
    }

    const result = await fetchUsageData({ apiClient: mockClient as any })

    expect(result).toEqual({
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    })
  })

  test('should handle null remaining balance', async () => {
    const { fetchUsageData } = await import('../use-usage-query')
    const mockClient = {
      post: mock(async () => ({
        ok: true,
        status: 200,
        data: {
          usage: 0,
          remainingBalance: null,
          next_quota_reset: null,
        },
      })),
    }

    const result = await fetchUsageData({ apiClient: mockClient as any })

    expect(result.remainingBalance).toBeNull()
    expect(result.next_quota_reset).toBeNull()
  })

  test('should handle zero usage and balance', async () => {
    const { fetchUsageData } = await import('../use-usage-query')
    const mockClient = {
      post: mock(async () => ({
        ok: true,
        status: 200,
        data: {
          usage: 0,
          remainingBalance: 0,
          next_quota_reset: '2024-02-01T00:00:00.000Z',
        },
      })),
    }

    const result = await fetchUsageData({ apiClient: mockClient as any })

    expect(result.usage).toBe(0)
    expect(result.remainingBalance).toBe(0)
  })

  test('should throw error on failed request', async () => {
    const { fetchUsageData } = await import('../use-usage-query')
    const mockClient = {
      post: mock(async () => ({ ok: false, status: 500, error: 'Server Error' })),
    }
    const mockLogger = createMockLogger()

    await expect(
      fetchUsageData({ apiClient: mockClient as any, logger: mockLogger }),
    ).rejects.toThrow('Failed to fetch usage: 500')
  })

  test('should throw error on 401 unauthorized', async () => {
    const { fetchUsageData } = await import('../use-usage-query')
    const mockClient = {
      post: mock(async () => ({ ok: false, status: 401, error: 'Unauthorized' })),
    }
    const mockLogger = createMockLogger()

    await expect(
      fetchUsageData({ apiClient: mockClient as any, logger: mockLogger }),
    ).rejects.toThrow('Failed to fetch usage: 401')
  })

  test('should use defaults when response has no data', async () => {
    const { fetchUsageData } = await import('../use-usage-query')
    const mockClient = {
      post: mock(async () => ({ ok: true, status: 200 })),
    }

    const result = await fetchUsageData({ apiClient: mockClient as any })

    expect(result.usage).toBe(0)
    expect(result.remainingBalance).toBeNull()
    expect(result.next_quota_reset).toBeNull()
  })
})

describe('usageQueryKeys', () => {
  test('all returns base query key', () => {
    expect(usageQueryKeys.all).toEqual(['usage'])
  })

  test('current returns extended query key', () => {
    expect(usageQueryKeys.current()).toEqual(['usage', 'current'])
  })

  test('current returns new array instance each call', () => {
    const first = usageQueryKeys.current()
    const second = usageQueryKeys.current()
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })

  test('query keys can be used for cache operations', () => {
    const mockData = {
      usage: 50,
      remainingBalance: 200,
      next_quota_reset: null,
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })
})

describe('useRefreshUsage behavior', () => {
  afterEach(() => {
    mock.restore()
    resetActivityQueryCache()
  })

  test('invalidating usage query preserves cached data', () => {
    const mockData = {
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)

    invalidateActivityQuery(usageQueryKeys.current())

    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })

  test('invalidation marks data as stale for refetching', () => {
    const mockData = {
      usage: 200,
      remainingBalance: 300,
      next_quota_reset: '2024-03-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    invalidateActivityQuery(usageQueryKeys.current())

    const cached = getActivityQueryData<typeof mockData>(
      usageQueryKeys.current(),
    )
    expect(cached?.usage).toBe(200)
    expect(cached?.remainingBalance).toBe(300)
  })
})

describe('usage query cache behavior', () => {
  afterEach(() => {
    mock.restore()
    resetActivityQueryCache()
  })

  test('should store and retrieve usage data from cache', () => {
    const mockData = {
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })

  test('should update cache when new data is set', () => {
    const initialData = {
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    const updatedData = {
      usage: 150,
      remainingBalance: 450,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), initialData)
    expect(
      getActivityQueryData<typeof initialData>(usageQueryKeys.current())?.usage,
    ).toBe(100)

    setActivityQueryData(usageQueryKeys.current(), updatedData)
    expect(
      getActivityQueryData<typeof initialData>(usageQueryKeys.current())?.usage,
    ).toBe(150)
  })

  test('should preserve data after invalidation', () => {
    const mockData = {
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    invalidateActivityQuery(usageQueryKeys.current())

    const cached = getActivityQueryData<typeof mockData>(
      usageQueryKeys.current(),
    )
    expect(cached).toEqual(mockData)
  })

  test('should handle cache removal', () => {
    const mockData = {
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeDefined()

    removeActivityQuery(usageQueryKeys.current())
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeUndefined()
  })

  test('should handle zero and null values correctly', () => {
    const mockData = {
      usage: 0,
      remainingBalance: 0,
      next_quota_reset: null,
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    const cached = getActivityQueryData<typeof mockData>(
      usageQueryKeys.current(),
    )

    expect(cached?.usage).toBe(0)
    expect(cached?.remainingBalance).toBe(0)
    expect(cached?.next_quota_reset).toBeNull()
  })

  test('reset clears usage cache', () => {
    const mockData = {
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: null,
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeDefined()

    resetActivityQueryCache()
    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toBeUndefined()
  })

  test('multiple invalidations preserve data', () => {
    const mockData = {
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    setActivityQueryData(usageQueryKeys.current(), mockData)

    invalidateActivityQuery(usageQueryKeys.current())
    invalidateActivityQuery(usageQueryKeys.current())
    invalidateActivityQuery(usageQueryKeys.current())

    expect(
      getActivityQueryData<typeof mockData>(usageQueryKeys.current()),
    ).toEqual(mockData)
  })
})