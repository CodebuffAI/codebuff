import { logger } from '../util/logger'

const CONTEXT7_API_BASE_URL = 'https://context7.com/api'
const DEFAULT_TYPE = 'txt'
const FETCH_TIMEOUT_MS = 10_000

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  )

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

/**
 * Lists all available documentation projects from Context7
 * @returns Array of projects with their metadata, or null if the request fails
 */
export async function listLibraries(): Promise<
  SearchResponse['projects'] | null
> {
  try {
    const url = new URL(`${CONTEXT7_API_BASE_URL}/projects`)
    const response = (await Promise.race([
      fetch(url),
      timeoutPromise(FETCH_TIMEOUT_MS),
    ])) as Response

    if (!response.ok) {
      logger.error(`Failed to search libraries: ${response.status}`)
      return null
    }

    const projects = await response.json()
    return projects
  } catch (error) {
    logger.error('Error searching libraries:', error)
    return null
  }
}
// Initialize the projects list once and export it as a promise
export const context7LibrariesPromise: Promise<SearchResponse['projects']> =
  listLibraries().then((res) => res || [])

/**
 * Fetches documentation context for a specific library
 * @param libraryId The library ID to fetch documentation for
 * @param options Options for the request
 * @returns The documentation text or null if the request fails
 */
export async function fetchContext7LibraryDocumentation(
  libraryId: string,
  options: {
    tokens?: number
    topic?: string
    folders?: string
  } = {}
): Promise<string | null> {
  try {
    if (libraryId.startsWith('/')) {
      libraryId = libraryId.slice(1)
    }

    const url = new URL(`${CONTEXT7_API_BASE_URL}/v1/${libraryId}`)
    if (options.tokens)
      url.searchParams.set('tokens', options.tokens.toString())
    if (options.topic) url.searchParams.set('topic', options.topic)
    if (options.folders) url.searchParams.set('folders', options.folders)
    url.searchParams.set('type', DEFAULT_TYPE)

    const response = (await Promise.race([
      fetch(url, {
        headers: {
          'X-Context7-Source': 'codebuff',
        },
      }),
      timeoutPromise(FETCH_TIMEOUT_MS),
    ])) as Response

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
