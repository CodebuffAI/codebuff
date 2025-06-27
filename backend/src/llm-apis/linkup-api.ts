import { withTimeout } from '@codebuff/common/util/promise'
import { env } from '@codebuff/internal'

import { logger } from '../util/logger'

const LINKUP_API_BASE_URL = 'https://api.linkup.so'
const FETCH_TIMEOUT_MS = 30_000

export interface LinkupSearchResult {
  title: string
  url: string
  content: string
}

export interface LinkupSearchResponse {
  results: LinkupSearchResult[]
}

/**
 * Searches the web using Linkup API
 * @param query The search query
 * @param options Search options including depth and max results
 * @returns Array of search results or null if the request fails
 */
export async function searchWeb(
  query: string,
  options: {
    depth?: 'standard' | 'deep'
    maxResults?: number
  } = {}
): Promise<LinkupSearchResult[] | null> {
  const { depth = 'standard', maxResults = 5 } = options

  try {
    const requestBody = {
      q: query,
      depth,
      outputTokens: maxResults * 500, // Estimate tokens per result
    }

    logger.debug(
      { query, depth, maxResults },
      'Making Linkup API search request'
    )

    const response = await withTimeout(
      fetch(`${LINKUP_API_BASE_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.LINKUP_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      }),
      FETCH_TIMEOUT_MS
    )

    if (!response.ok) {
      logger.error(
        { status: response.status, statusText: response.statusText },
        `Linkup API request failed: ${response.status}`
      )
      return null
    }

    const data = (await response.json()) as LinkupSearchResponse

    if (!data.results || !Array.isArray(data.results)) {
      logger.error({ data }, 'Invalid response format from Linkup API')
      return null
    }

    // Limit results to maxResults
    const limitedResults = data.results.slice(0, maxResults)

    logger.debug(
      { resultCount: limitedResults.length, query },
      'Linkup API search completed successfully'
    )

    return limitedResults
  } catch (error) {
    logger.error({ error, query, options }, 'Error calling Linkup API')
    return null
  }
}
