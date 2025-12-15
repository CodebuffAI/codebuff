import { withTimeout } from '@codebuff/common/util/promise'

import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface LinkupEnv {
  LINKUP_API_KEY: string
}

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

const headersToRecord = (headers: Headers): Record<string, string> => {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key] = value
  })
  return record
}

export async function searchWeb(options: {
  query: string
  depth?: 'standard' | 'deep'
  logger: Logger
  fetch: typeof globalThis.fetch
  serverEnv: LinkupEnv
}): Promise<string | null> {
  const { query, depth = 'standard', logger, fetch, serverEnv } = options
  const apiStartTime = Date.now()

  if (!serverEnv.LINKUP_API_KEY) {
    return 'No API key found. Please set LINKUP_API_KEY in your environment.'
  }

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
      fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serverEnv.LINKUP_API_KEY}`,
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
          headers: headersToRecord(response.headers),
        },
        `Request failed with ${response.status}: ${response.statusText}`,
      )
      return null
    }

    let data: LinkupSearchResponse
    let parseDuration = 0
    try {
      const parseStartTime = Date.now()
      data = (await response.json()) as LinkupSearchResponse
      parseDuration = Date.now() - parseStartTime
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
          parseDuration,
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
          parseDuration,
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
        parseDuration,
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
