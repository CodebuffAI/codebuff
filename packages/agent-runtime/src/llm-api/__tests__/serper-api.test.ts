import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'

import { searchWeb } from '../serper-api'

import type { AgentRuntimeDeps } from '@codebuff/common/types/contracts/agent-runtime'

const testServerEnv = { SERPER_API_KEY: 'test-api-key' }

describe('Serper API', () => {
  let agentRuntimeImpl: AgentRuntimeDeps & { serverEnv: typeof testServerEnv }

  beforeAll(async () => {
    await mockModule('@codebuff/common/util/promise', () => ({
      withTimeout: async (promise: Promise<any>, timeout: number) => promise,
    }))
  })

  beforeEach(() => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      serverEnv: testServerEnv,
    }
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
  })

  test('should successfully search with basic query', async () => {
    const mockResponse = {
      searchParameters: { q: 'React tutorial', type: 'search', num: 10 },
      organic: [
        {
          title: 'React Documentation',
          link: 'https://react.dev',
          snippet:
            'React is a JavaScript library for building user interfaces.',
          position: 1,
        },
      ],
    }

    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as unknown as typeof global.fetch

    const result = await searchWeb({
      ...agentRuntimeImpl,
      query: 'React tutorial',
    })

    expect(JSON.parse(result!)).toEqual(mockResponse)
    expect(agentRuntimeImpl.fetch).toHaveBeenCalledWith(
      'https://google.serper.dev/search',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': 'test-api-key',
        },
        body: JSON.stringify({
          q: 'React tutorial',
          num: 10,
        }),
      }),
    )
  })

  test('should handle custom depth', async () => {
    const mockResponse = {
      searchParameters: { q: 'React patterns', type: 'search', num: 20 },
      organic: [
        {
          title: 'Advanced React Patterns',
          link: 'https://example.com/advanced-react',
          snippet: 'Deep dive into React patterns and best practices.',
          position: 1,
        },
      ],
    }

    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as unknown as typeof global.fetch

    const result = await searchWeb({
      ...agentRuntimeImpl,
      query: 'React patterns',
      depth: 'deep',
    })

    expect(JSON.parse(result!)).toEqual(mockResponse)
    expect(agentRuntimeImpl.fetch).toHaveBeenCalledWith(
      'https://google.serper.dev/search',
      expect.objectContaining({
        body: JSON.stringify({
          q: 'React patterns',
          num: 20,
        }),
      }),
    )
  })

  test('should handle API errors gracefully', async () => {
    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      )
    }) as unknown as typeof global.fetch

    const result = await searchWeb({ ...agentRuntimeImpl, query: 'test query' })

    expect(result).toBeNull()
  })

  test('should handle network errors', async () => {
    agentRuntimeImpl.fetch = mock(() => {
      return Promise.reject(new Error('Network error'))
    }) as unknown as typeof global.fetch

    const result = await searchWeb({ ...agentRuntimeImpl, query: 'test query' })

    expect(result).toBeNull()
  })

  test('should handle invalid response format', async () => {
    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(['invalid']), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as unknown as typeof global.fetch

    const result = await searchWeb({ ...agentRuntimeImpl, query: 'test query' })

    expect(result).toBeNull()
  })

  test('should return JSON search results without an answer field', async () => {
    const mockResponse = {
      organic: [
        {
          title: 'Test result',
          link: 'https://example.com',
          snippet: 'Test snippet',
          position: 1,
        },
      ],
    }

    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as unknown as typeof global.fetch

    const result = await searchWeb({
      ...agentRuntimeImpl,
      query: 'test query',
    })

    expect(JSON.parse(result!)).toEqual(mockResponse)
  })

  test('should return sparse JSON search results', async () => {
    const mockResponse = {
      searchParameters: { q: 'test query', type: 'search' },
      organic: [],
    }

    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as unknown as typeof global.fetch

    const result = await searchWeb({ ...agentRuntimeImpl, query: 'test query' })

    expect(JSON.parse(result!)).toEqual(mockResponse)
  })

  test('should use default options when none provided', async () => {
    const mockResponse = {
      organic: [
        { title: 'Test', link: 'https://example.com', snippet: 'Test content' },
      ],
    }

    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as unknown as typeof global.fetch

    await searchWeb({ ...agentRuntimeImpl, query: 'test query' })

    expect(agentRuntimeImpl.fetch).toHaveBeenCalledWith(
      'https://google.serper.dev/search',
      expect.objectContaining({
        body: JSON.stringify({
          q: 'test query',
          num: 10,
        }),
      }),
    )
  })

  test('should handle malformed JSON response', async () => {
    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response('invalid json{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as unknown as typeof global.fetch
    agentRuntimeImpl.logger.error = mock(() => {})

    const result = await searchWeb({ ...agentRuntimeImpl, query: 'test query' })

    expect(result).toBeNull()
    expect(agentRuntimeImpl.logger.error).toHaveBeenCalled()
  })

  test('should log detailed error information for 404 responses', async () => {
    const mockErrorResponse =
      'Not Found - The requested endpoint does not exist'
    agentRuntimeImpl.fetch = mock(() => {
      return Promise.resolve(
        new Response(mockErrorResponse, {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/plain' },
        }),
      )
    }) as unknown as typeof global.fetch

    const result = await searchWeb({
      ...agentRuntimeImpl,
      query: 'test query for 404',
    })

    expect(result).toBeNull()
    expect(agentRuntimeImpl.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 404,
        statusText: 'Not Found',
        responseBody: mockErrorResponse,
        requestUrl: 'https://google.serper.dev/search',
        query: 'test query for 404',
      }),
      expect.stringContaining('404'),
    )
  })
})
