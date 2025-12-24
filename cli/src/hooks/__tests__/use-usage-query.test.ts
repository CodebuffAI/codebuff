import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import type { ClientEnv } from '@codebuff/common/types/contracts/env'

import { useChatStore } from '../../state/chat-store'
import * as authModule from '../../utils/auth'

let fetchUsageData: typeof import('../use-usage-query').fetchUsageData
let useUsageQuery: typeof import('../use-usage-query').useUsageQuery
let useRefreshUsage: typeof import('../use-usage-query').useRefreshUsage
let usageQueryKeys: typeof import('../use-usage-query').usageQueryKeys
let lastQueryOptions: any
let queryClientMock: { invalidateQueries: (...args: any[]) => void }

beforeAll(async () => {
  await mockModule('@tanstack/react-query', () => ({
    useQuery: (options: any) => {
      lastQueryOptions = options
      return { data: undefined, isSuccess: false, error: null } as any
    },
    useQueryClient: () => queryClientMock,
  }))

  ;({
    fetchUsageData,
    useUsageQuery,
    useRefreshUsage,
    usageQueryKeys,
  } = await import('../use-usage-query'))
})

afterAll(() => {
  clearMockedModules()
})

beforeEach(() => {
  lastQueryOptions = undefined
})

describe('fetchUsageData', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://test.codebuff.local'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalEnv
    mock.restore()
  })

  test('should fetch usage data successfully', async () => {
    const mockResponse = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      balanceBreakdown: { free: 300, paid: 200 },
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    const result = await fetchUsageData({ authToken: 'test-token' })

    expect(result).toEqual(mockResponse)
  })

  test('should throw error on failed request', async () => {
    globalThis.fetch = mock(
      async () => new Response('Error', { status: 500 }),
    ) as unknown as typeof fetch
    const mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }

    await expect(
      fetchUsageData({ authToken: 'test-token', logger: mockLogger as any }),
    ).rejects.toThrow('Failed to fetch usage: 500')
  })

  test('should throw error when app URL is not set', async () => {
    await expect(
      fetchUsageData({
        authToken: 'test-token',
        clientEnv: {
          NEXT_PUBLIC_CODEBUFF_APP_URL: undefined,
        } as unknown as ClientEnv,
      }),
    ).rejects.toThrow('NEXT_PUBLIC_CODEBUFF_APP_URL is not set')
  })
})

describe('useUsageQuery', () => {
  let getAuthTokenSpy: ReturnType<typeof spyOn>
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://test.codebuff.local'
    useChatStore.getState().reset()
  })

  afterEach(() => {
    getAuthTokenSpy?.mockRestore()
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalEnv
    mock.restore()
  })

  test('should fetch data when enabled', async () => {
    getAuthTokenSpy = spyOn(authModule, 'getAuthToken').mockReturnValue(
      'test-token',
    )

    const mockResponse = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    useUsageQuery()

    expect(lastQueryOptions?.enabled).toBe(true)

    const result = await lastQueryOptions.queryFn()
    expect(result).toEqual(mockResponse)
  })

  test('should not fetch when disabled', () => {
    getAuthTokenSpy = spyOn(authModule, 'getAuthToken').mockReturnValue(
      'test-token',
    )
    const fetchMock = mock(async () => new Response('{}')) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    useUsageQuery({ enabled: false })

    expect(lastQueryOptions?.enabled).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('should not fetch when no auth token', () => {
    getAuthTokenSpy = spyOn(authModule, 'getAuthToken').mockReturnValue(
      undefined,
    )
    const fetchMock = mock(async () => new Response('{}')) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    useUsageQuery()

    expect(lastQueryOptions?.enabled).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useRefreshUsage', () => {
  afterEach(() => {
    mock.restore()
  })

  test('should invalidate usage queries', () => {
    const invalidateSpy = mock(() => {})
    queryClientMock = { invalidateQueries: invalidateSpy }

    const refresh = useRefreshUsage()
    refresh()

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: usageQueryKeys.current(),
    })
  })
})
