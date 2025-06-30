import { withTimeout } from '@codebuff/common/util/promise'
import { env } from '@codebuff/internal'

import { logger } from '../util/logger'

const LINKUP_API_BASE_URL = 'https://api.linkup.so/v1'
const FETCH_TIMEOUT_MS = 30_000

export interface LinkupSearchResult {
  name: string
  snippet: string
  url: string
}

export interface LinkupSearchResponse {
  answer: string
  sources: LinkupSearchResult[]
}

/**
 * Searches the web using Linkup API
 * @param query The search query
 * @param options Search options including depth and max results
 * @returns Array containing a single result with the sourced answer or null if the request fails
 */
export async function searchWeb(
  query: string,
  options: {
    depth?: 'standard' | 'deep'
  } = {}
): Promise<string | null> {
  const { depth = 'standard' } = options

  const requestBody = {
    q: query,
    depth,
    outputType: 'sourcedAnswer' as const,
  }
  const requestUrl = `${LINKUP_API_BASE_URL}/search`
  try {
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
      let responseBody = 'Unable to read response body'
      try {
        responseBody = await response.text()
      } catch (bodyError) {
        logger.warn({ bodyError }, 'Failed to read error response body')
      }

      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          responseBody,
          requestUrl,
          requestBody,
          query,
          depth,
          headers: response.headers
            ? (() => {
                const headerObj: Record<string, string> = {}
                response.headers.forEach((value, key) => {
                  headerObj[key] = value
                })
                return headerObj
              })()
            : 'No headers',
        },
        `Linkup API request failed with ${response.status}: ${response.statusText}`
      )
      return null
    }

    let data: LinkupSearchResponse
    try {
      data = (await response.json()) as LinkupSearchResponse
    } catch (jsonError) {
      logger.error(
        {
          jsonError,
          query,
          requestUrl,
          status: response.status,
          statusText: response.statusText,
        },
        'Failed to parse JSON response from Linkup API'
      )
      return null
    }

    if (!data.answer || typeof data.answer !== 'string') {
      logger.error(
        {
          data,
          query,
          requestUrl,
          responseKeys: Object.keys(data || {}),
          answerType: typeof data?.answer,
        },
        'Invalid response format from Linkup API - missing or invalid answer field'
      )
      return null
    }

    // Return the answer as a single result for compatibility
    return data.answer
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        query,
        options,
        requestUrl,
        requestBody,
      },
      'Error calling Linkup API - network or other failure'
    )
    return null
  }
}
