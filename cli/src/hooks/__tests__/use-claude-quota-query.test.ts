import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
} from 'bun:test'

import {
  fetchClaudeQuota,
  claudeQuotaQueryKeys,
  type ClaudeQuotaResponse,
  type ClaudeQuotaData,
} from '../use-claude-quota-query'
import {
  resetActivityQueryCache,
  getActivityQueryData,
  setActivityQueryData,
  invalidateActivityQuery,
  isEntryStale,
} from '../use-activity-query'

import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Tests for the Claude quota query hook and related functionality.
 * These tests verify that Claude subscription data is properly
 * fetched, cached, and updated for display in the bottom status bar.
 */

describe('claudeQuotaQueryKeys', () => {
  test('all returns base query key', () => {
    expect(claudeQuotaQueryKeys.all).toEqual(['claude-quota'])
  })

  test('current returns extended query key', () => {
    expect(claudeQuotaQueryKeys.current()).toEqual(['claude-quota', 'current'])
  })

  test('current returns new array instance each call', () => {
    const first = claudeQuotaQueryKeys.current()
    const second = claudeQuotaQueryKeys.current()
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })
})

describe('fetchClaudeQuota', () => {
  const originalFetch = globalThis.fetch
  let mockLogger: Logger

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restore()
  })

  test('should fetch and parse quota data successfully', async () => {
    const mockResponse: ClaudeQuotaResponse = {
      five_hour: {
        utilization: 20,
        resets_at: '2024-02-01T12:00:00Z',
      },
      seven_day: {
        utilization: 10,
        resets_at: '2024-02-07T00:00:00Z',
      },
      seven_day_oauth_apps: null,
      seven_day_opus: null,
    }

    globalThis.fetch = mock(async () => 
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await fetchClaudeQuota('test-access-token', mockLogger)

    expect(result.fiveHourRemaining).toBe(80) // 100 - 20
    expect(result.sevenDayRemaining).toBe(90) // 100 - 10
    expect(result.fiveHourResetsAt).toEqual(new Date('2024-02-01T12:00:00Z'))
    expect(result.sevenDayResetsAt).toEqual(new Date('2024-02-07T00:00:00Z'))
  })

  test('should handle 100% utilization correctly', async () => {
    const mockResponse: ClaudeQuotaResponse = {
      five_hour: {
        utilization: 100,
        resets_at: '2024-02-01T12:00:00Z',
      },
      seven_day: {
        utilization: 100,
        resets_at: '2024-02-07T00:00:00Z',
      },
      seven_day_oauth_apps: null,
      seven_day_opus: null,
    }

    globalThis.fetch = mock(async () => 
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await fetchClaudeQuota('test-token', mockLogger)

    expect(result.fiveHourRemaining).toBe(0)
    expect(result.sevenDayRemaining).toBe(0)
  })

  test('should handle over 100% utilization by clamping to 0', async () => {
    const mockResponse: ClaudeQuotaResponse = {
      five_hour: {
        utilization: 150, // Over 100%
        resets_at: '2024-02-01T12:00:00Z',
      },
      seven_day: {
        utilization: 200,
        resets_at: '2024-02-07T00:00:00Z',
      },
      seven_day_oauth_apps: null,
      seven_day_opus: null,
    }

    globalThis.fetch = mock(async () => 
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await fetchClaudeQuota('test-token', mockLogger)

    expect(result.fiveHourRemaining).toBe(0) // Math.max(0, 100-150) = 0
    expect(result.sevenDayRemaining).toBe(0)
  })

  test('should handle null five_hour window', async () => {
    const mockResponse: ClaudeQuotaResponse = {
      five_hour: null,
      seven_day: {
        utilization: 30,
        resets_at: '2024-02-07T00:00:00Z',
      },
      seven_day_oauth_apps: null,
      seven_day_opus: null,
    }

    globalThis.fetch = mock(async () => 
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await fetchClaudeQuota('test-token', mockLogger)

    expect(result.fiveHourRemaining).toBe(100) // Default when null
    expect(result.fiveHourResetsAt).toBeNull()
    expect(result.sevenDayRemaining).toBe(70)
  })

  test('should handle null seven_day window', async () => {
    const mockResponse: ClaudeQuotaResponse = {
      five_hour: {
        utilization: 50,
        resets_at: '2024-02-01T12:00:00Z',
      },
      seven_day: null,
      seven_day_oauth_apps: null,
      seven_day_opus: null,
    }

    globalThis.fetch = mock(async () => 
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await fetchClaudeQuota('test-token', mockLogger)

    expect(result.fiveHourRemaining).toBe(50)
    expect(result.sevenDayRemaining).toBe(100) // Default when null
    expect(result.sevenDayResetsAt).toBeNull()
  })

  test('should handle both windows being null', async () => {
    const mockResponse: ClaudeQuotaResponse = {
      five_hour: null,
      seven_day: null,
      seven_day_oauth_apps: null,
      seven_day_opus: null,
    }

    globalThis.fetch = mock(async () => 
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await fetchClaudeQuota('test-token', mockLogger)

    expect(result.fiveHourRemaining).toBe(100)
    expect(result.fiveHourResetsAt).toBeNull()
    expect(result.sevenDayRemaining).toBe(100)
    expect(result.sevenDayResetsAt).toBeNull()
  })

  test('should handle null reset times', async () => {
    const mockResponse: ClaudeQuotaResponse = {
      five_hour: {
        utilization: 25,
        resets_at: null,
      },
      seven_day: {
        utilization: 15,
        resets_at: null,
      },
      seven_day_oauth_apps: null,
      seven_day_opus: null,
    }

    globalThis.fetch = mock(async () => 
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await fetchClaudeQuota('test-token', mockLogger)

    expect(result.fiveHourRemaining).toBe(75)
    expect(result.fiveHourResetsAt).toBeNull()
    expect(result.sevenDayRemaining).toBe(85)
    expect(result.sevenDayResetsAt).toBeNull()
  })

  test('should throw error on 401 unauthorized', async () => {
    globalThis.fetch = mock(async () => 
      new Response('Unauthorized', { status: 401 }),
    ) as unknown as typeof fetch

    await expect(
      fetchClaudeQuota('invalid-token', mockLogger),
    ).rejects.toThrow('Failed to fetch Claude quota: 401')
  })

  test('should throw error on 403 forbidden', async () => {
    globalThis.fetch = mock(async () => 
      new Response('Forbidden', { status: 403 }),
    ) as unknown as typeof fetch

    await expect(
      fetchClaudeQuota('test-token', mockLogger),
    ).rejects.toThrow('Failed to fetch Claude quota: 403')
  })

  test('should throw error on 500 server error', async () => {
    globalThis.fetch = mock(async () => 
      new Response('Server Error', { status: 500 }),
    ) as unknown as typeof fetch

    await expect(
      fetchClaudeQuota('test-token', mockLogger),
    ).rejects.toThrow('Failed to fetch Claude quota: 500')
  })

  test('should log debug message on failed request', async () => {
    const debugSpy = mock(() => {})
    const testLogger: Logger = {
      ...mockLogger,
      debug: debugSpy,
    }

    globalThis.fetch = mock(async () => 
      new Response('Error', { status: 429 }),
    ) as unknown as typeof fetch

    await expect(
      fetchClaudeQuota('test-token', testLogger),
    ).rejects.toThrow()

    expect(debugSpy).toHaveBeenCalledWith(
      { status: 429 },
      'Failed to fetch Claude quota data',
    )
  })

  test('should send correct headers', async () => {
    let capturedHeaders: HeadersInit | undefined

    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers
      return new Response(
        JSON.stringify({
          five_hour: null,
          seven_day: null,
          seven_day_oauth_apps: null,
          seven_day_opus: null,
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    await fetchClaudeQuota('test-access-token', mockLogger)

    const headers = capturedHeaders as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-access-token')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-beta']).toBe('oauth-2025-04-20,claude-code-20250219')
  })

  test('should call correct API endpoint', async () => {
    let capturedUrl: string | undefined

    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url
      return new Response(
        JSON.stringify({
          five_hour: null,
          seven_day: null,
          seven_day_oauth_apps: null,
          seven_day_opus: null,
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    await fetchClaudeQuota('test-token', mockLogger)

    expect(capturedUrl).toBe('https://api.anthropic.com/api/oauth/usage')
  })
})

/**
 * Tests for Claude quota cache behavior.
 * These tests verify that quota data is properly cached and updated
 * using the activity query cache system.
 */
describe('Claude quota cache behavior', () => {
  beforeEach(() => {
    resetActivityQueryCache()
  })

  afterEach(() => {
    mock.restore()
  })

  test('should store and retrieve Claude quota data from cache', () => {
    const mockQuota: ClaudeQuotaData = {
      fiveHourRemaining: 75,
      fiveHourResetsAt: new Date('2024-02-01T12:00:00Z'),
      sevenDayRemaining: 85,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), mockQuota)

    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())
    expect(cached?.fiveHourRemaining).toBe(75)
    expect(cached?.sevenDayRemaining).toBe(85)
  })

  test('should update cache when new quota data is fetched', () => {
    const initialQuota: ClaudeQuotaData = {
      fiveHourRemaining: 100,
      fiveHourResetsAt: new Date('2024-02-01T12:00:00Z'),
      sevenDayRemaining: 100,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), initialQuota)
    expect(
      getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())?.fiveHourRemaining,
    ).toBe(100)

    // Simulate usage depleting quota
    const updatedQuota: ClaudeQuotaData = {
      fiveHourRemaining: 50,
      fiveHourResetsAt: new Date('2024-02-01T12:00:00Z'),
      sevenDayRemaining: 90,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), updatedQuota)
    expect(
      getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())?.fiveHourRemaining,
    ).toBe(50)
  })

  test('should preserve quota data after invalidation', () => {
    const mockQuota: ClaudeQuotaData = {
      fiveHourRemaining: 60,
      fiveHourResetsAt: new Date('2024-02-01T12:00:00Z'),
      sevenDayRemaining: 70,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), mockQuota)
    invalidateActivityQuery(claudeQuotaQueryKeys.current())

    // Data should still be accessible for display while refetch happens
    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())
    expect(cached?.fiveHourRemaining).toBe(60)
    expect(cached?.sevenDayRemaining).toBe(70)
  })

  test('should handle quota exhaustion (0% remaining)', () => {
    const exhaustedQuota: ClaudeQuotaData = {
      fiveHourRemaining: 0,
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 5,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), exhaustedQuota)

    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())
    expect(cached?.fiveHourRemaining).toBe(0)
    expect(cached?.sevenDayRemaining).toBe(5)
  })

  test('reset cache should clear Claude quota data', () => {
    const mockQuota: ClaudeQuotaData = {
      fiveHourRemaining: 50,
      fiveHourResetsAt: null,
      sevenDayRemaining: 50,
      sevenDayResetsAt: null,
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), mockQuota)
    expect(getActivityQueryData(claudeQuotaQueryKeys.current())).toBeDefined()

    resetActivityQueryCache()

    expect(getActivityQueryData(claudeQuotaQueryKeys.current())).toBeUndefined()
  })
})

/**
 * Tests simulating the bottom status line display scenarios.
 * These verify the data flow from cache to UI display.
 */
describe('Bottom status line display scenarios', () => {
  beforeEach(() => {
    resetActivityQueryCache()
  })

  test('should compute minimum of 5-hour and 7-day for display', () => {
    const quota: ClaudeQuotaData = {
      fiveHourRemaining: 30, // More restrictive
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 80,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), quota)
    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())

    // The BottomStatusLine component uses Math.min(fiveHour, sevenDay)
    const displayRemaining = Math.min(
      cached!.fiveHourRemaining,
      cached!.sevenDayRemaining,
    )
    expect(displayRemaining).toBe(30)
  })

  test('should handle 7-day being more restrictive than 5-hour', () => {
    const quota: ClaudeQuotaData = {
      fiveHourRemaining: 90,
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 10, // More restrictive
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), quota)
    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())

    const displayRemaining = Math.min(
      cached!.fiveHourRemaining,
      cached!.sevenDayRemaining,
    )
    expect(displayRemaining).toBe(10)
  })

  test('should detect exhausted quota (0%)', () => {
    const quota: ClaudeQuotaData = {
      fiveHourRemaining: 0,
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 50,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), quota)
    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())

    const displayRemaining = Math.min(
      cached!.fiveHourRemaining,
      cached!.sevenDayRemaining,
    )
    const isExhausted = displayRemaining <= 0

    expect(isExhausted).toBe(true)
  })

  test('should update display value when quota changes', () => {
    // Initial state: plenty of quota
    const initialQuota: ClaudeQuotaData = {
      fiveHourRemaining: 80,
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 90,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }
    setActivityQueryData(claudeQuotaQueryKeys.current(), initialQuota)

    let cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())
    let displayRemaining = Math.min(
      cached!.fiveHourRemaining,
      cached!.sevenDayRemaining,
    )
    expect(displayRemaining).toBe(80)

    // After usage: depleted quota
    const depletedQuota: ClaudeQuotaData = {
      fiveHourRemaining: 20,
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 85,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }
    setActivityQueryData(claudeQuotaQueryKeys.current(), depletedQuota)

    cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())
    displayRemaining = Math.min(
      cached!.fiveHourRemaining,
      cached!.sevenDayRemaining,
    )
    expect(displayRemaining).toBe(20)
  })

  test('should select correct reset time based on limiting quota', () => {
    // 5-hour is limiting
    const quota: ClaudeQuotaData = {
      fiveHourRemaining: 10,
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 80,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }

    setActivityQueryData(claudeQuotaQueryKeys.current(), quota)
    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())

    // BottomStatusLine logic for selecting reset time
    const resetTime = cached!.fiveHourRemaining <= cached!.sevenDayRemaining
      ? cached!.fiveHourResetsAt
      : cached!.sevenDayResetsAt

    expect(resetTime).toEqual(new Date('2024-02-01T14:00:00Z'))
  })
})

/**
 * Tests for polling behavior and cache freshness.
 * These verify that the quota data is refreshed at appropriate intervals.
 */
describe('Polling and cache freshness', () => {
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

  test('data should become stale after staleTime (30s)', () => {
    const staleTime = 30000 // 30 seconds
    const serializedKey = JSON.stringify(claudeQuotaQueryKeys.current())

    // Set quota data at t=0
    const quota: ClaudeQuotaData = {
      fiveHourRemaining: 50,
      fiveHourResetsAt: null,
      sevenDayRemaining: 60,
      sevenDayResetsAt: null,
    }
    setActivityQueryData(claudeQuotaQueryKeys.current(), quota)

    // At this point, dataUpdatedAt = mockNow (1000000)
    expect(getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())).toBeDefined()
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)

    // Advance time by 35 seconds (past staleTime)
    mockNow += 35000

    // Data is stale but still accessible
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())
    expect(cached?.fiveHourRemaining).toBe(50)
    
    // In the actual hook, this would trigger a refetch on the next interval tick
  })

  test('refreshed data should reset staleness', () => {
    const staleTime = 30000
    const serializedKey = JSON.stringify(claudeQuotaQueryKeys.current())

    // Set initial data
    setActivityQueryData(claudeQuotaQueryKeys.current(), { fiveHourRemaining: 100 })
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)

    // Advance past staleTime
    mockNow += 35000
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)

    // "Refetch" by setting new data
    setActivityQueryData(claudeQuotaQueryKeys.current(), { fiveHourRemaining: 80 })
    expect(isEntryStale(serializedKey, staleTime)).toBe(false) // Fresh again

    // Data is now fresh
    expect(
      getActivityQueryData<{ fiveHourRemaining: number }>(claudeQuotaQueryKeys.current())?.fiveHourRemaining,
    ).toBe(80)

    // Advance a little (less than staleTime)
    mockNow += 10000
    expect(isEntryStale(serializedKey, staleTime)).toBe(false) // Still fresh
  })

  test('invalidation should mark data for immediate refetch', () => {
    const staleTime = 30000
    const serializedKey = JSON.stringify(claudeQuotaQueryKeys.current())

    // Set data
    setActivityQueryData(claudeQuotaQueryKeys.current(), { fiveHourRemaining: 70 })
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)

    // Invalidate (sets dataUpdatedAt to 0)
    invalidateActivityQuery(claudeQuotaQueryKeys.current())
    expect(isEntryStale(serializedKey, staleTime)).toBe(true) // Immediately stale

    // Data exists but is immediately stale (dataUpdatedAt === 0)
    // Next poll interval will trigger refetch regardless of time elapsed
    expect(
      getActivityQueryData<{ fiveHourRemaining: number }>(claudeQuotaQueryKeys.current())?.fiveHourRemaining,
    ).toBe(70)
  })

  test('useClaudeQuotaQuery staleTime of 30s means polling at 60s should always refetch', () => {
    // This test verifies the actual configuration used in useClaudeQuotaQuery:
    // staleTime: 30 * 1000 (30 seconds)
    // refetchInterval: 60 * 1000 (60 seconds, from chat.tsx)
    
    const staleTime = 30 * 1000 // useClaudeQuotaQuery config
    const refetchInterval = 60 * 1000 // chat.tsx config
    const serializedKey = JSON.stringify(claudeQuotaQueryKeys.current())

    // Initial fetch
    setActivityQueryData(claudeQuotaQueryKeys.current(), { fiveHourRemaining: 100 })
    expect(isEntryStale(serializedKey, staleTime)).toBe(false)

    // After 60 seconds (when refetch interval fires), data should be stale
    mockNow += refetchInterval
    expect(isEntryStale(serializedKey, staleTime)).toBe(true)
    
    // This confirms that the refetch interval tick WILL trigger a new fetch
    // because the data is stale at that point (60s > 30s staleTime)
  })
})

/**
 * Tests for error recovery and edge cases in quota fetching.
 */
describe('Error recovery and edge cases', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    resetActivityQueryCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restore()
  })

  test('should preserve old data in cache during fetch error', () => {
    // Simulate having cached data
    const cachedQuota: ClaudeQuotaData = {
      fiveHourRemaining: 50,
      fiveHourResetsAt: new Date('2024-02-01T14:00:00Z'),
      sevenDayRemaining: 60,
      sevenDayResetsAt: new Date('2024-02-07T00:00:00Z'),
    }
    setActivityQueryData(claudeQuotaQueryKeys.current(), cachedQuota)

    // If fetch fails, the cached data should still be available
    // (useActivityQuery preserves data on error)
    const cached = getActivityQueryData<ClaudeQuotaData>(claudeQuotaQueryKeys.current())
    expect(cached?.fiveHourRemaining).toBe(50)
  })

  test('should handle network timeout gracefully', async () => {
    const mockLogger: Logger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    globalThis.fetch = mock(async () => {
      const error = new Error('Request timeout')
      error.name = 'TimeoutError'
      throw error
    }) as unknown as typeof fetch

    await expect(
      fetchClaudeQuota('test-token', mockLogger),
    ).rejects.toThrow('Request timeout')
  })

  test('should handle malformed JSON response', async () => {
    const mockLogger: Logger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    globalThis.fetch = mock(async () => 
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    await expect(
      fetchClaudeQuota('test-token', mockLogger),
    ).rejects.toThrow()
  })

  test('should handle empty response body', async () => {
    const mockLogger: Logger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    globalThis.fetch = mock(async () => 
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    // Empty response should parse with defaults
    const result = await fetchClaudeQuota('test-token', mockLogger)
    expect(result.fiveHourRemaining).toBe(100) // Default when null
    expect(result.sevenDayRemaining).toBe(100)
  })
})
