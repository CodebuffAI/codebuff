import { withTimeout } from '@codebuff/common/util/promise'

import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface SerperEnv {
  SERPER_API_KEY?: string
}

const SERPER_API_BASE_URL = 'https://google.serper.dev'
const FETCH_TIMEOUT_MS = 30_000

export interface SerperOrganicResult {
  title?: string
  link?: string
  snippet?: string
  position?: number
}

export interface SerperSearchResponse {
  searchParameters?: {
    q?: string
    type?: string
    num?: number
  }
  knowledgeGraph?: unknown
  answerBox?: unknown
  organic?: SerperOrganicResult[]
  peopleAlsoAsk?: unknown[]
  relatedSearches?: unknown[]
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
  serverEnv: SerperEnv
}): Promise<string | null> {
  const { query, depth = 'standard', logger, fetch, serverEnv } = options
  const apiStartTime = Date.now()

  if (!serverEnv.SERPER_API_KEY) {
    return 'No API key found. Please set SERPER_API_KEY in your environment.'
  }

  const requestBody = {
    q: query,
    num: depth === 'deep' ? 20 : 10,
  }
  const requestUrl = `${SERPER_API_BASE_URL}/search`

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
          'X-API-KEY': serverEnv.SERPER_API_KEY,
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

    let data: SerperSearchResponse
    let parseDuration = 0
    try {
      const parseStartTime = Date.now()
      const responseBody = await response.json()
      data = responseBody as SerperSearchResponse
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

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      logger.error(
        {
          ...apiContext,
          responseKeys: Object.keys(data || {}),
          fetchDuration,
          parseDuration,
          totalDuration: Date.now() - apiStartTime,
        },
        'Invalid response format from Serper',
      )
      return null
    }

    const result = JSON.stringify(data, null, 2)
    const totalDuration = Date.now() - apiStartTime
    logger.info(
      {
        ...apiContext,
        resultLength: result.length,
        organicCount: data.organic?.length || 0,
        hasAnswerBox: Boolean(data.answerBox),
        hasKnowledgeGraph: Boolean(data.knowledgeGraph),
        fetchDuration,
        parseDuration,
        totalDuration,
        success: true,
      },
      'Completed web search',
    )

    return result
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
