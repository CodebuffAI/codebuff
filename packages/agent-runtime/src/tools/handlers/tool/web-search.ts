import { jsonToolResult } from '@codebuff/common/util/messages'

import {
  WEBSEARCH_TIMEOUT_MS,
  executeWebSearch,
  extractLinks,
  resolveGitHubUrl,
  stripHtml,
} from './web-search-utils'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const MAX_FETCH_LENGTH = 50_000

export const handleWebSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'web_search'>
  logger: Logger

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  userInputId: string
  userId: string | undefined
}): Promise<{
  output: CodebuffToolOutput<'web_search'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentStepId,
    clientSessionId,
    fingerprintId,
    logger,
    repoId,
    userId,
    userInputId,
  } = params
  const { query, depth, url, include_links, max_links } = toolCall.input

  const startTime = Date.now()
  const logContext = {
    toolCallId: toolCall.toolCallId,
    query,
    url,
    depth,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  const creditsUsed = 0

  // URL-fetch branch: fetch the page content and return its text + links
  if (url) {
    try {
      // GitHub repo URLs → fetch raw README directly for clean content
      const rawUrl = resolveGitHubUrl(url)
      const fetchUrl = rawUrl ?? url
      const isRaw = rawUrl !== null

      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Codebuff/1.0; +https://openbuff.dev)',
        },
        signal: AbortSignal.timeout(WEBSEARCH_TIMEOUT_MS),
      })

      if (!response.ok) {
        return {
          output: jsonToolResult({
            errorMessage: `Failed to fetch ${fetchUrl}: HTTP ${response.status} ${response.statusText}`,
          }),
          creditsUsed,
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      const rawHtml = await response.text()
      const isHtml = !isRaw && contentType.includes('text/html')
      const content = isHtml ? stripHtml(rawHtml) : rawHtml
      const result =
        content.length > MAX_FETCH_LENGTH
          ? content.slice(0, MAX_FETCH_LENGTH) +
            '\n\n[Content truncated — page exceeds 50,000 characters]'
          : content

      // Extract links from HTML pages (not raw text/markdown)
      const shouldExtractLinks = include_links !== false && isHtml
      const links = shouldExtractLinks
        ? extractLinks(rawHtml, url, max_links ?? 40)
        : undefined

      logger.info(
        {
          ...logContext,
          durationMs: Date.now() - startTime,
          contentLength: content.length,
          linkCount: links?.length ?? 0,
          isRaw,
        },
        'URL fetch completed',
      )
      if (links !== undefined) {
        return { output: jsonToolResult({ result, links }), creditsUsed }
      }
      return { output: jsonToolResult({ result }), creditsUsed }
    } catch (error) {
      const errorMessage = `Error fetching ${url}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
      logger.error(
        { ...logContext, error, durationMs: Date.now() - startTime },
        'URL fetch failed',
      )
      return { output: jsonToolResult({ errorMessage }), creditsUsed }
    }
  }

  // Search branch: use Open Websearch as an in-process library.
  if (!query) {
    return {
      output: jsonToolResult({
        errorMessage: 'Either query or url must be provided',
      }),
      creditsUsed,
    }
  }

  try {
    const searchResult = await executeWebSearch(query, depth ?? 'standard')

    if ('error' in searchResult) {
      logger.warn(
        {
          ...logContext,
          error: searchResult.error,
          durationMs: Date.now() - startTime,
        },
        'open-websearch returned error',
      )
      return {
        output: jsonToolResult({ errorMessage: searchResult.error }),
        creditsUsed,
      }
    }

    if (searchResult.results.length === 0) {
      logger.warn(
        { ...logContext, durationMs: Date.now() - startTime },
        'open-websearch returned no results',
      )
      return {
        output: jsonToolResult({
          errorMessage: `No search results found for "${query}"`,
        }),
        creditsUsed,
      }
    }

    logger.info(
      {
        ...logContext,
        durationMs: Date.now() - startTime,
        resultCount: searchResult.results.length,
      },
      'Search completed via open-websearch',
    )
    return {
      output: jsonToolResult({
        result: JSON.stringify(searchResult.results, null, 2),
      }),
      creditsUsed,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime

    const errorMessage = `Error performing web search for "${query}": ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      { ...logContext, error, durationMs },
      'Search failed with error',
    )
    return { output: jsonToolResult({ errorMessage }), creditsUsed }
  }
}) satisfies CodebuffToolHandlerFunction<'web_search'>
