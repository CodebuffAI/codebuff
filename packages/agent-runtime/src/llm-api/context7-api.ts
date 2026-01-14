import { withTimeout } from '@codebuff/common/util/promise'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'

const CONTEXT7_API_BASE_URL = 'https://context7.com/api/v1'
const DEFAULT_TYPE = 'txt'
const FETCH_TIMEOUT_MS = 10_000

export interface SearchResponse {
  results: Array<{
    id: string
    title: string
    description: string
    branch: string
    lastUpdateDate: string
    state: DocumentState
    totalTokens: number
    totalSnippets: number
    totalPages: number
    stars?: number
    trustScore?: number
  }>
}

type DocumentState = 'initial' | 'finalized' | 'error' | 'delete'
export interface SearchResult {
  id: string
  title: string
  description: string
  branch: string
  lastUpdateDate: string
  state: DocumentState
  totalTokens: number
  totalSnippets: number
  totalPages: number
  stars?: number
  trustScore?: number
}

/**
 * Lists all available documentation projects from Context7
 * @returns Array of projects with their metadata, or null if the request fails
 */
export async function searchLibraries(params: {
  query: string
  logger: Logger
  fetch: typeof globalThis.fetch
}): Promise<SearchResult[] | null> {
  const { query, logger, fetch } = params

  const searchStartTime = Date.now()
  const searchContext = {
    query,
    queryLength: query.length,
  }

  try {
    const url = new URL(`${CONTEXT7_API_BASE_URL}/search`)
    url.searchParams.set('query', query)

    const fetchStartTime = Date.now()
    const response = await withTimeout(
      fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env['CONTEXT7_API_KEY']}`,
        },
      }),
      FETCH_TIMEOUT_MS,
    )
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
    const projects = responseBody as SearchResponse
    const parseDuration = Date.now() - parseStartTime
    const totalDuration = Date.now() - searchStartTime

    logger.debug(
      {
        ...searchContext,
        fetchDuration,
        parseDuration,
        totalDuration,
        resultsCount: projects.results?.length || 0,
        success: true,
      },
      'Library search completed successfully',
    )

    return projects.results
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
  params: {
    query: string
    tokens?: number
    topic?: string
    folders?: string
    logger: Logger
    fetch: typeof globalThis.fetch
  } & ParamsOf<typeof searchLibraries>,
): Promise<string | null> {
  const { query, tokens, topic, folders, logger, fetch } = params

  const apiStartTime = Date.now()
  const apiContext = {
    query,
    requestedTokens: tokens,
    topic,
    folders,
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
    const url = new URL(`${CONTEXT7_API_BASE_URL}/${libraryId}`)
    if (tokens) url.searchParams.set('tokens', tokens.toString())
    if (topic) url.searchParams.set('topic', topic)
    if (folders) url.searchParams.set('folders', folders)
    url.searchParams.set('type', DEFAULT_TYPE)

    const fetchStartTime = Date.now()
    const response = await withTimeout(
      fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env['CONTEXT7_API_KEY']}`,
          'X-Context7-Source': 'codebuff',
        },
      }),
      FETCH_TIMEOUT_MS,
    )
    const fetchDuration = Date.now() - fetchStartTime

    if (!response.ok) {
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

    if (
      !text ||
      text === 'No content available' ||
      text === 'No context data available'
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

    const estimatedTokens = Math.ceil(text.length / 4) // Rough token estimate
    logger.info(
      {
        ...apiContext,
        libraryId,
        libraryTitle: selectedLibrary.title,
        searchDuration,
        fetchDuration,
        parseDuration,
        totalDuration,
        responseLength: text.length,
        estimatedTokens,
        success: true,
      },
      'Documentation fetch completed successfully',
    )

    return text
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
