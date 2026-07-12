import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'

import {
  searchLibraries,
  fetchContext7LibraryDocumentation,
} from '../context7-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger

function makeResponse(
  body: unknown,
  opts: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  const isOk = opts.ok ?? true
  const status = opts.status ?? 200
  const isJson = typeof body !== 'string'
  return {
    ok: isOk,
    status,
    statusText: opts.statusText ?? (isOk ? 'OK' : 'Error'),
    json: async () => (isJson ? body : JSON.parse(body as string)),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

beforeEach(() => {
  // Ensure CONTEXT7_API_KEY is absent so the Authorization header is
  // "Bearer undefined" deterministically (matches production behavior when
  // the key is unset).
  delete process.env['CONTEXT7_API_KEY']
})

afterEach(() => {
  mock.restore()
})

describe('searchLibraries', () => {
  test('returns results on a 200 response', async () => {
    const fetchMock = mock(async (_url: URL | string) =>
      makeResponse({
        results: [
          {
            id: '/react',
            title: 'React',
            description: 'A JS library',
            branch: 'main',
            lastUpdateDate: '2026-01-01',
            state: 'finalized',
            totalTokens: 10000,
            totalSnippets: 50,
            totalPages: 5,
          },
        ],
      }),
    )

    const out = await searchLibraries({
      query: 'react',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    expect(out).toHaveLength(1)
    expect(out![0].id).toBe('/react')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(fetchMock.mock.calls[0][0].toString())
    expect(url.searchParams.get('query')).toBe('react')
    expect(url.pathname).toBe('/api/v1/search')
  })

  test('returns null on a non-OK status', async () => {
    const fetchMock = mock(async () =>
      makeResponse('error', { ok: false, status: 500 }),
    )
    const out = await searchLibraries({
      query: 'x',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeNull()
  })

  test('returns null when fetch throws', async () => {
    const fetchMock = mock(async () => {
      throw new Error('network down')
    })
    const out = await searchLibraries({
      query: 'x',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeNull()
  })

  test('returns empty array when results array is empty', async () => {
    const fetchMock = mock(async () => makeResponse({ results: [] }))
    const out = await searchLibraries({
      query: 'x',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toEqual([])
  })

  test('returns undefined when results key is missing from response', async () => {
    const fetchMock = mock(async () => makeResponse({ other: 'stuff' }))
    const out = await searchLibraries({
      query: 'x',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeUndefined()
  })
})

describe('fetchContext7LibraryDocumentation', () => {
  test('returns documentation text when search finds a library and fetch succeeds', async () => {
    const searchResponse = makeResponse({
      results: [
        {
          id: '/react',
          title: 'React',
          description: '',
          branch: 'main',
          lastUpdateDate: '2026-01-01',
          state: 'finalized',
          totalTokens: 10000,
          totalSnippets: 50,
          totalPages: 5,
        },
      ],
    })
    const docResponse = makeResponse('# React Docs\n\nUseful content.')

    const fetchMock = mock(async (url: URL | string) => {
      const u = new URL(url.toString())
      if (u.pathname === '/api/v1/search') return searchResponse
      if (u.pathname === '/api/v1//react') return docResponse
      throw new Error(`unexpected url: ${u.toString()}`)
    })

    const out = await fetchContext7LibraryDocumentation({
      query: 'react',
      tokens: 5000,
      topic: 'hooks',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    expect(out).toMatchObject({
      documentation: '# React Docs\n\nUseful content.',
      selectedLibrary: { id: '/react', title: 'React' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Verify the doc URL carries the optional query params and type=txt.
    const docUrl = new URL(
      (fetchMock.mock.calls[1][0] as unknown as URL).toString(),
    )
    expect(docUrl.pathname).toBe('/api/v1//react')
    expect(docUrl.searchParams.get('tokens')).toBe('5000')
    expect(docUrl.searchParams.get('topic')).toBe('hooks')
    expect(docUrl.searchParams.get('type')).toBe('txt')
  })

  test('ranks an exact library title above an ambiguous first result and preserves alternatives', async () => {
    const base = {
      description: '',
      branch: 'main',
      lastUpdateDate: '2026-01-01',
      state: 'finalized',
      totalTokens: 100,
      totalSnippets: 2,
      totalPages: 1,
    }
    const fetchMock = mock(async (url: URL | string) => {
      const parsed = new URL(url.toString())
      if (parsed.pathname === '/api/v1/search') {
        return makeResponse({
          results: [
            { ...base, id: '/other/react-tools', title: 'React Tools' },
            { ...base, id: '/facebook/react', title: 'React' },
          ],
        })
      }
      if (parsed.pathname === '/api/v1//facebook/react') {
        return makeResponse('official docs')
      }
      throw new Error(`unexpected url: ${parsed}`)
    })

    const out = await fetchContext7LibraryDocumentation({
      query: 'React',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out?.selectedLibrary.id).toBe('/facebook/react')
    expect(out?.alternatives[0]?.id).toBe('/other/react-tools')
  })

  test('returns null when no libraries are found by search', async () => {
    const fetchMock = mock(async () => makeResponse({ results: [] }))
    const out = await fetchContext7LibraryDocumentation({
      query: 'nope',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('returns null when search returns null', async () => {
    const fetchMock = mock(async () =>
      makeResponse('err', { ok: false, status: 500 }),
    )
    const out = await fetchContext7LibraryDocumentation({
      query: 'react',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeNull()
  })

  test('returns null when the doc endpoint responds with "No content available"', async () => {
    const searchResponse = makeResponse({
      results: [
        {
          id: '/lib',
          title: 'Lib',
          description: '',
          branch: 'main',
          lastUpdateDate: '2026-01-01',
          state: 'finalized',
          totalTokens: 100,
          totalSnippets: 1,
          totalPages: 1,
        },
      ],
    })
    const fetchMock = mock(async (url: URL | string) => {
      const u = new URL(url.toString())
      if (u.pathname === '/api/v1/search') return searchResponse
      return makeResponse('No content available')
    })

    const out = await fetchContext7LibraryDocumentation({
      query: 'lib',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeNull()
  })

  test('returns null when the doc endpoint responds with a non-OK status', async () => {
    const searchResponse = makeResponse({
      results: [
        {
          id: '/lib',
          title: 'Lib',
          description: '',
          branch: 'main',
          lastUpdateDate: '2026-01-01',
          state: 'finalized',
          totalTokens: 100,
          totalSnippets: 1,
          totalPages: 1,
        },
      ],
    })
    const fetchMock = mock(async (url: URL | string) => {
      const u = new URL(url.toString())
      if (u.pathname === '/api/v1/search') return searchResponse
      return makeResponse('error', { ok: false, status: 503 })
    })

    const out = await fetchContext7LibraryDocumentation({
      query: 'lib',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeNull()
  })

  test('returns null when the doc fetch throws', async () => {
    const searchResponse = makeResponse({
      results: [
        {
          id: '/lib',
          title: 'Lib',
          description: '',
          branch: 'main',
          lastUpdateDate: '2026-01-01',
          state: 'finalized',
          totalTokens: 100,
          totalSnippets: 1,
          totalPages: 1,
        },
      ],
    })
    let callCount = 0
    const fetchMock = mock(async (url: URL | string) => {
      callCount++
      if (callCount === 1) return searchResponse
      throw new Error('doc fetch failed')
    })

    const out = await fetchContext7LibraryDocumentation({
      query: 'lib',
      logger: noopLogger,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    expect(out).toBeNull()
  })
})
