import { beforeEach, describe, expect, mock, test } from 'bun:test'

import {
  fetchContext7LibraryDocumentation,
  searchLibraries,
} from '../context7-api'
import { countTokens } from '../../util/token-counter'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { SearchResult } from '../context7-api'

const websiteSearchResult = {
  id: '/websites/airbrake_io',
  title: 'Airbrake',
  description: 'Airbrake documentation',
  branch: 'main',
  lastUpdateDate: '2026-07-01T00:00:00.000Z',
  state: 'finalized',
  totalTokens: 10_000,
  totalSnippets: 100,
} satisfies SearchResult

describe('Context7 API', () => {
  let logger: Logger

  beforeEach(() => {
    logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }
  })

  test('searches libraries through the v2 API with relevance context', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe('/api/v2/libs/search')
      expect(url.searchParams.get('libraryName')).toBe('@airbrake/browser')
      expect(url.searchParams.get('query')).toBe('browser error reporting')

      return Response.json({ results: [websiteSearchResult] })
    }) as unknown as typeof globalThis.fetch

    const results = await searchLibraries({
      query: '@airbrake/browser',
      topic: 'browser error reporting',
      logger,
      fetch: fetchMock,
    })

    expect(results).toEqual([websiteSearchResult])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('fetches documentation for website library IDs through v2 context', async () => {
    const documentation = 'Airbrake browser notifier documentation'
    const requestedUrls: URL[] = []
    const requestSignals: AbortSignal[] = []
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        requestedUrls.push(url)
        if (init?.signal) requestSignals.push(init.signal)

        if (url.pathname === '/api/v2/libs/search') {
          return Response.json({ results: [websiteSearchResult] })
        }
        if (url.pathname === '/api/v2/context') {
          return new Response(documentation)
        }
        return new Response('Not found', { status: 404 })
      },
    ) as unknown as typeof globalThis.fetch

    const result = await fetchContext7LibraryDocumentation({
      query: '@airbrake/browser',
      topic: 'browser error reporting',
      tokens: 10_000,
      logger,
      fetch: fetchMock,
    })

    expect(result).toBe(documentation)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestSignals).toHaveLength(2)
    expect(requestSignals.every((signal) => !signal.aborted)).toBe(true)

    const contextUrl = requestedUrls[1]
    expect(contextUrl.pathname).toBe('/api/v2/context')
    expect(contextUrl.searchParams.get('libraryId')).toBe(
      '/websites/airbrake_io',
    )
    expect(contextUrl.searchParams.get('query')).toBe('browser error reporting')
    expect(contextUrl.searchParams.has('tokens')).toBe(false)
    expect(contextUrl.searchParams.get('type')).toBe('txt')
  })

  test('enforces the token budget locally because v2 does not accept one', async () => {
    const documentation = 'Airbrake documentation and examples. '.repeat(100)
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/v2/libs/search') {
        return Response.json({ results: [websiteSearchResult] })
      }
      return new Response(documentation)
    }) as unknown as typeof globalThis.fetch

    const result = await fetchContext7LibraryDocumentation({
      query: '@airbrake/browser',
      topic: 'browser errors',
      tokens: 25,
      logger,
      fetch: fetchMock,
    })

    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThan(documentation.length)
    expect(countTokens(result!)).toBeLessThanOrEqual(25)
  })

  test('returns no documentation while a library is still processing', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/v2/libs/search') {
        return Response.json({ results: [websiteSearchResult] })
      }
      return Response.json(
        { message: 'Library is not finalized' },
        { status: 202 },
      )
    }) as unknown as typeof globalThis.fetch

    const result = await fetchContext7LibraryDocumentation({
      query: '@airbrake/browser',
      topic: 'browser errors',
      logger,
      fetch: fetchMock,
    })

    expect(result).toBeNull()
  })

  test('discards malformed search entries instead of throwing', async () => {
    const fetchMock = mock(async () =>
      Response.json({ results: [null, {}, { id: '' }] }),
    ) as unknown as typeof globalThis.fetch

    const result = await fetchContext7LibraryDocumentation({
      query: 'React',
      topic: 'hooks',
      logger,
      fetch: fetchMock,
    })

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalled()
  })

  test('does not call Context7 for a whitespace-only library name', async () => {
    const fetchMock = mock(async () =>
      Response.json({ results: [websiteSearchResult] }),
    ) as unknown as typeof globalThis.fetch

    const result = await fetchContext7LibraryDocumentation({
      query: '   ',
      topic: 'browser errors',
      logger,
      fetch: fetchMock,
    })

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('treats whitespace-padded no-content responses as empty', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/v2/libs/search') {
        return Response.json({ results: [websiteSearchResult] })
      }
      return new Response('  No content available\n')
    }) as unknown as typeof globalThis.fetch

    const result = await fetchContext7LibraryDocumentation({
      query: '@airbrake/browser',
      topic: 'browser errors',
      logger,
      fetch: fetchMock,
    })

    expect(result).toBeNull()
  })

  test('returns null for malformed search responses', async () => {
    const fetchMock = mock(async () =>
      Response.json({ results: null }),
    ) as unknown as typeof globalThis.fetch

    const result = await searchLibraries({
      query: 'React',
      logger,
      fetch: fetchMock,
    })

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })
})
