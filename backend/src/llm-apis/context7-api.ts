import { withTimeout } from 'common/util/promise'
import { logger } from '../util/logger'

const CONTEXT7_API_BASE_URL = 'https://context7.com/api/v1'
const DEFAULT_TYPE = 'txt'
const FETCH_TIMEOUT_MS = 10_000

export interface SearchResponse {
  projects: Array<{
    settings: {
      title: string
      project: string
      folders: string[]
      docsRepoUrl: string
    }
    version: {
      lastUpdate: string
      state:
        | 'initial'
        | 'parsed'
        | 'finalized'
        | 'invalid_docs'
        | 'error'
        | 'stop'
        | 'delete'
      parseDuration: number
      totalTokens: number
      totalSnippets: number
      averageTokens: number
    }
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
export async function searchLibraries(
  query: string
): Promise<SearchResult[] | null> {
  try {
    const url = new URL(`${CONTEXT7_API_BASE_URL}/search`)
    url.searchParams.set('query', query)
    console.log('url', url)
    const response = await withTimeout(fetch(url), FETCH_TIMEOUT_MS)

    if (!response.ok) {
      logger.error(`Failed to search libraries: ${response.status}`)
      return null
    }

    const projects = await response.json()
    return projects.results
  } catch (error) {
    logger.error('Error searching libraries:', error)
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
  query: string,
  options: {
    tokens?: number
    topic?: string
    folders?: string
  } = {}
): Promise<string | null> {
  const libraries = await searchLibraries(query)
  if (!libraries || libraries.length === 0) {
    return null
  }

  const libraryId = libraries[0].id
  try {
    const url = new URL(`${CONTEXT7_API_BASE_URL}/${libraryId}`)
    if (options.tokens)
      url.searchParams.set('tokens', options.tokens.toString())
    if (options.topic) url.searchParams.set('topic', options.topic)
    if (options.folders) url.searchParams.set('folders', options.folders)
    url.searchParams.set('type', DEFAULT_TYPE)

    const response = await withTimeout(
      fetch(url, {
        headers: {
          'X-Context7-Source': 'codebuff',
        },
      }),
      FETCH_TIMEOUT_MS
    )

    if (!response.ok) {
      logger.error(
        { status: response.status },
        `Failed to fetch Context7 documentation: ${response.status}`
      )
      return null
    }

    const text = await response.text()
    if (
      !text ||
      text === 'No content available' ||
      text === 'No context data available'
    ) {
      return null
    }
    return text
  } catch (error) {
    logger.error({ error }, 'Error fetching library documentation')
    return null
  }
}
