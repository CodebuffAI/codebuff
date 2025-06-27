import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { searchWeb } from '../linkup-api'

// Mock environment variables
process.env.LINKUP_API_KEY = 'test-api-key'

mock.module('@codebuff/internal', () => ({
  env: {
    LINKUP_API_KEY: 'test-api-key',
  },
}))

// Mock logger
mock.module('../../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
}))

// Mock withTimeout utility
mock.module('@codebuff/common/util/promise', () => ({
  withTimeout: async (promise: Promise<any>, timeout: number) => promise,
}))

describe('Linkup API', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = mock(() => Promise.resolve(new Response()))
  })

  afterEach(() => {
    mock.restore()
  })

  test('should successfully search with basic query', async () => {
    const mockResponse = {
      results: [
        {
          title: 'React Documentation',
          url: 'https://react.dev',
          content: 'React is a JavaScript library for building user interfaces.',
        },
        {
          title: 'Getting Started with React',
          url: 'https://react.dev/learn',
          content: 'Learn how to build your first React application.',
        },
      ],
    }

    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const results = await searchWeb('React tutorial')

    expect(results).toHaveLength(2)
    expect(results![0].title).toBe('React Documentation')
    expect(results![0].url).toBe('https://react.dev')
    expect(results![0].content).toBe('React is a JavaScript library for building user interfaces.')

    // Verify fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledWith(
      'https://api.linkup.so/search',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
        },
        body: JSON.stringify({
          q: 'React tutorial',
          depth: 'standard',
          outputTokens: 2500, // 5 results * 500 tokens
        }),
      })
    )
  })

  test('should handle custom depth and max results', async () => {
    const mockResponse = {
      results: [
        {
          title: 'Advanced React Patterns',
          url: 'https://example.com/advanced-react',
          content: 'Deep dive into React patterns and best practices.',
        },
      ],
    }

    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const results = await searchWeb('React patterns', {
      depth: 'deep',
      maxResults: 3,
    })

    expect(results).toHaveLength(1)
    expect(results![0].title).toBe('Advanced React Patterns')

    // Verify fetch was called with correct parameters
    expect(fetch).toHaveBeenCalledWith(
      'https://api.linkup.so/search',
      expect.objectContaining({
        body: JSON.stringify({
          q: 'React patterns',
          depth: 'deep',
          outputTokens: 1500, // 3 results * 500 tokens
        }),
      })
    )
  })

  test('should limit results to maxResults', async () => {
    const mockResponse = {
      results: [
        { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1' },
        { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2' },
        { title: 'Result 3', url: 'https://example.com/3', content: 'Content 3' },
        { title: 'Result 4', url: 'https://example.com/4', content: 'Content 4' },
        { title: 'Result 5', url: 'https://example.com/5', content: 'Content 5' },
      ],
    }

    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const results = await searchWeb('test query', { maxResults: 3 })

    expect(results).toHaveLength(3)
    expect(results![0].title).toBe('Result 1')
    expect(results![2].title).toBe('Result 3')
  })

  test('should handle API errors gracefully', async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      )
    )

    const results = await searchWeb('test query')

    expect(results).toBeNull()
  })

  test('should handle network errors', async () => {
    global.fetch = mock(() =>
      Promise.reject(new Error('Network error'))
    )

    const results = await searchWeb('test query')

    expect(results).toBeNull()
  })

  test('should handle invalid response format', async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ invalid: 'format' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const results = await searchWeb('test query')

    expect(results).toBeNull()
  })

  test('should handle non-array results', async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ results: 'not an array' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const results = await searchWeb('test query')

    expect(results).toBeNull()
  })

  test('should handle empty results', async () => {
    const mockResponse = {
      results: [],
    }

    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const results = await searchWeb('test query')

    expect(results).toEqual([])
  })

  test('should use default options when none provided', async () => {
    const mockResponse = {
      results: [
        { title: 'Test', url: 'https://example.com', content: 'Test content' },
      ],
    }

    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    await searchWeb('test query')

    // Verify fetch was called with default parameters
    expect(fetch).toHaveBeenCalledWith(
      'https://api.linkup.so/search',
      expect.objectContaining({
        body: JSON.stringify({
          q: 'test query',
          depth: 'standard',
          outputTokens: 2500, // 5 results * 500 tokens (default)
        }),
      })
    )
  })

  test('should handle malformed JSON response', async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        new Response('invalid json{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    const results = await searchWeb('test query')

    expect(results).toBeNull()
  })
})
