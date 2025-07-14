import { logger } from '../../../util/logger'

export interface SearchResponse {
  results: SearchResult[]
}

export interface SearchResult {
  content: string
  relevance: number
}

/**
 * Searches for library documentation using Context7 API
 * @param query The search query
 * @returns Search results or null if not found
 */
export async function searchLibraries(query: string): Promise<SearchResponse | null> {
  logger.warn({ query }, 'Context7 API is not implemented - returning empty results')
  return {
    results: []
  }
}

/**
 * Fetches documentation for a specific library from Context7
 * @param libraryTitle The name of the library
 * @param options Optional parameters for the request
 * @returns Documentation content or null if not found
 */
export async function fetchContext7LibraryDocumentation(
  libraryTitle: string,
  options?: {
    topic?: string
    tokens?: number
  }
): Promise<string | null> {
  logger.warn(
    { libraryTitle, options },
    'Context7 API is not implemented - returning null'
  )
  
  // Return null to indicate no documentation found
  // This will trigger the fallback message in the handlers
  return null
}
