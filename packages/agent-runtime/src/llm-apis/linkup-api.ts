import { withTimeout } from '@codebuff/common/util/promise'
import { env } from '@codebuff/internal'

import type { Logger } from '@codebuff/common/types/contracts/logger'

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
export async function searchWeb(options: {
  query: string
  depth?: 'standard' | 'deep'
  logger: Logger
  fetch: typeof globalThis.fetch
}): Promise<string | null> {
  const { query, depth = 'standard', logger, fetch } = options
  const apiStartTime = Date.now()

  const requestBody = {
    q: query,
    depth,
    outputType: 'sourcedAnswer' as const,
  }
  const requestUrl = `${LINKUP_API_BASE_URL}/search`

  const apiContext = {
    query,
    depth,
    requestUrl,
    queryLength: query.length,
  }

  try {
    const fetchStartTime = Date.now()
    const response = await withTimeout(
      fetch(`${LINKUP_API_BASE_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.LINKUP_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      }),
      FETCH_TIMEOUT_MS,
    )
    const fetchDuration = Date.now() - fetchStartTime

    if (!response.ok) {
      let responseBody = 'Unable to read response body'
      try {
        responseBody = await response.text()
      } catch (bodyError) {
        logger.warn(
          {
            ...apiContext,
            bodyError,
            fetchDuration,
          },
          'Failed to read error response body',
        )
      }

      logger.error(
        {
          ...apiContext,
          status: response.status,
          statusText: response.statusText,
          responseBody: responseBody.substring(0, 500), // Truncate long responses
          fetchDuration,
          totalDuration: Date.now() - apiStartTime,
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
        `Request failed with ${response.status}: ${response.statusText}`,
      )
      return null
    }

    let data: LinkupSearchResponse
    try {
      const parseStartTime = Date.now()
      data = (await response.json()) as LinkupSearchResponse
      const parseDuration = Date.now() - parseStartTime
    } catch (jsonError) {
      logger.error(
        {
          ...apiContext,
          jsonError:
            jsonError instanceof Error
              ? {
                  name: jsonError.name,
                  message: jsonError.message,
                }
              : jsonError,
          fetchDuration,
          totalDuration: Date.now() - apiStartTime,
          status: response.status,
          statusText: response.statusText,
        },
        'Failed to parse JSON response',
      )
      return null
    }

    if (!data.answer || typeof data.answer !== 'string') {
      logger.error(
        {
          ...apiContext,
          responseKeys: Object.keys(data || {}),
          answerType: typeof data?.answer,
          answerLength: data?.answer?.length || 0,
          sourcesCount: data?.sources?.length || 0,
          fetchDuration,
          totalDuration: Date.now() - apiStartTime,
        },
        'Invalid response format - missing or invalid answer field',
      )
      return null
    }

    const totalDuration = Date.now() - apiStartTime
    logger.info(
      {
        ...apiContext,
        answerLength: data.answer.length,
        sourcesCount: data.sources?.length || 0,
        fetchDuration,
        totalDuration,
        success: true,
      },
      'Completed web search',
    )

    // Return the answer as a single result for compatibility
    return data.answer
  } catch (error) {
    const totalDuration = Date.now() - apiStartTime
    logger.error(
      {
        ...apiContext,
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
      'Network or other failure during web search',
    )
    return null
  }
}
