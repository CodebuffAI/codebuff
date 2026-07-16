import type { Logger } from '@codebuff/common/types/contracts/logger'

import { countTokens } from '../util/token-counter'

const CONTEXT7_API_BASE_URL = 'https://context7.com/api/v2'
const DEFAULT_TYPE = 'txt'
const FETCH_TIMEOUT_MS = 10_000

type DocumentState = 'initial' | 'finalized' | 'error' | 'delete'

export interface SearchResult {
  id: string
  title?: string
  description?: string
  branch?: string
  lastUpdateDate?: string
  state?: DocumentState
  totalTokens?: number
  totalSnippets?: number
  totalPages?: number
  stars?: number
  trustScore?: number
}

export interface SearchResponse {
  results: SearchResult[]
}

type Context7RequestParams = {
  query: string
  topic?: string
  logger: Logger
  fetch: typeof globalThis.fetch
}

function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== 'object') return false
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' && id.startsWith('/') && id.length > 1
}

function getRequestHeaders(includeSource = false): Record<string, string> {
  const headers: Record<string, string> = {}
  const apiKey = process.env['CONTEXT7_API_KEY']
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (includeSource) headers['X-Context7-Source'] = 'codebuff'
  return headers
}

function truncateToTokenBudget(text: string, maxTokens?: number): string {
  if (!maxTokens || countTokens(text) <= maxTokens) return text

  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (countTokens(text.slice(0, middle)) <= maxTokens) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  // Avoid returning half of a UTF-16 surrogate pair.
  if (
    low > 0 &&
    low < text.length &&
    text.charCodeAt(low - 1) >= 0xd800 &&
    text.charCodeAt(low - 1) <= 0xdbff
  ) {
    low--
  }
  return text.slice(0, low)
}

/**
 * Lists all available documentation projects from Context7
 * @returns Array of projects with their metadata, or null if the request fails
 */
export async function searchLibraries(
  params: Context7RequestParams,
): Promise<SearchResult[] | null> {
  const { query, topic, logger, fetch } = params
  const libraryName = query.trim()
  const contextQuery = topic?.trim() || libraryName

  const searchStartTime = Date.now()
  const searchContext = {
    query,
    queryLength: query.length,
  }

  if (!libraryName) {
    logger.warn(searchContext, 'Library search requires a non-empty name')
    return null
  }

  try {
    const url = new URL(`${CONTEXT7_API_BASE_URL}/libs/search`)
    url.searchParams.set('libraryName', libraryName)
    url.searchParams.set('query', contextQuery)

    const fetchStartTime = Date.now()
    const response = await fetch(url, {
      headers: getRequestHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const fetchDuration = Date.now() - fetchStartTime

    if (!response.ok) {
      logger.error(
        {
          ...searchContext,
          status: response.status,
          statusText: response.statusText,
          fetchDuration,
          totalDuration: Date.now() - searchStartTime,
        },
        `Library search failed with status ${response.status}`,
      )
      return null
    }

    const parseStartTime = Date.now()
    const responseBody = await response.json()
    const parseDuration = Date.now() - parseStartTime
    const totalDuration = Date.now() - searchStartTime
    const rawResults = (responseBody as Partial<SearchResponse>)?.results
    if (!Array.isArray(rawResults)) {
      logger.error(
        {
          ...searchContext,
          fetchDuration,
          parseDuration,
          totalDuration,
        },
        'Library search returned an invalid response',
      )
      return null
    }
    const results = rawResults.filter(isSearchResult)
    if (results.length !== rawResults.length) {
      logger.warn(
        {
          ...searchContext,
          invalidResultsCount: rawResults.length - results.length,
        },
        'Library search discarded invalid results',
      )
    }

    logger.debug(
      {
        ...searchContext,
        fetchDuration,
        parseDuration,
        totalDuration,
        resultsCount: results.length,
        success: true,
      },
      'Library search completed successfully',
    )

    return results
  } catch (error) {
    const totalDuration = Date.now() - searchStartTime
    logger.error(
      {
        ...searchContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        totalDuration,
        success: false,
      },
      'Error during library search',
    )
    return null
  }
}

/**
 * Fetches documentation context for a specific library
 * @param libraryId The library ID to fetch documentation for
 * @param options Options for the request
 * @returns The documentation text or null if the request fails
 */
export async function fetchContext7LibraryDocumentation(
  params: Context7RequestParams & {
    tokens?: number
  },
): Promise<string | null> {
  const { query, tokens, topic, logger, fetch } = params

  const apiStartTime = Date.now()
  const apiContext = {
    query,
    requestedTokens: tokens,
    topic,
  }

  const searchStartTime = Date.now()
  const libraries = await searchLibraries(params)
  const searchDuration = Date.now() - searchStartTime

  if (!libraries || libraries.length === 0) {
    logger.warn(
      {
        ...apiContext,
        searchDuration,
        totalDuration: Date.now() - apiStartTime,
        librariesFound: 0,
      },
      'No libraries found for query',
    )
    return null
  }

  const selectedLibrary = libraries[0]
  const libraryId = selectedLibrary.id

  logger.debug(
    {
      ...apiContext,
      searchDuration,
      librariesFound: libraries.length,
      selectedLibrary: {
        id: selectedLibrary.id,
        title: selectedLibrary.title,
        totalTokens: selectedLibrary.totalTokens,
        stars: selectedLibrary.stars,
      },
    },
    'Selected library for documentation fetch',
  )

  try {
    const url = new URL(`${CONTEXT7_API_BASE_URL}/context`)
    url.searchParams.set('libraryId', libraryId)
    url.searchParams.set('query', topic?.trim() || query.trim())
    url.searchParams.set('type', DEFAULT_TYPE)

    const fetchStartTime = Date.now()
    const response = await fetch(url, {
      headers: getRequestHeaders(true),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const fetchDuration = Date.now() - fetchStartTime

    if (!response.ok || response.status === 202) {
      logger.error(
        {
          ...apiContext,
          libraryId,
          status: response.status,
          statusText: response.statusText,
          searchDuration,
          fetchDuration,
          totalDuration: Date.now() - apiStartTime,
        },
        `Failed to fetch documentation with status ${response.status}`,
      )
      return null
    }

    const parseStartTime = Date.now()
    const text = await response.text()
    const parseDuration = Date.now() - parseStartTime
    const totalDuration = Date.now() - apiStartTime

    const normalizedText = text.trim()
    if (
      !normalizedText ||
      normalizedText === 'No content available' ||
      normalizedText === 'No context data available'
    ) {
      logger.warn(
        {
          ...apiContext,
          libraryId,
          searchDuration,
          fetchDuration,
          parseDuration,
          totalDuration,
          responseLength: text?.length || 0,
          emptyResponse: true,
        },
        'Received empty or no-content response',
      )
      return null
    }

    const documentation = truncateToTokenBudget(text, tokens)
    const estimatedTokens = countTokens(documentation)
    logger.info(
      {
        ...apiContext,
        libraryId,
        libraryTitle: selectedLibrary.title,
        searchDuration,
        fetchDuration,
        parseDuration,
        totalDuration,
        responseLength: documentation.length,
        estimatedTokens,
        success: true,
      },
      'Documentation fetch completed successfully',
    )

    return documentation
  } catch (error) {
    const totalDuration = Date.now() - apiStartTime
    logger.error(
      {
        ...apiContext,
        libraryId,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        searchDuration,
        totalDuration,
        success: false,
      },
      'Error fetching library documentation',
    )
    return null
  }
}
