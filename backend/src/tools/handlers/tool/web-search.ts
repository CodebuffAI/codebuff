import { consumeCreditsWithFallback } from '@codebuff/billing'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'

import { getRequestContext } from '../../../context/app-context'
import { searchWeb } from '../../../llm-apis/linkup-api'

import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleWebSearch = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'web_search'>
  logger: Logger

  agentStepId: string
  clientSessionId: string
  userInputId: string

  state: {
    userId?: string
    fingerprintId?: string
    repoId?: string
  }
}): { result: Promise<CodebuffToolOutput<'web_search'>>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
    logger,
    agentStepId,
    clientSessionId,
    userInputId,
    state,
  } = params
  const { query, depth } = toolCall.input
  const { userId, fingerprintId, repoId } = state
  if (!fingerprintId) {
    throw new Error(
      'Internal error for web_search: Missing fingerprintId in state',
    )
  }

  const searchStartTime = Date.now()
  const searchContext = {
    toolCallId: toolCall.toolCallId,
    query,
    depth,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  const webSearchPromise: Promise<CodebuffToolOutput<'web_search'>> =
    (async () => {
      try {
        const searchResult = await searchWeb({ query, depth, logger })
        const searchDuration = Date.now() - searchStartTime
        const resultLength = searchResult?.length || 0
        const hasResults = Boolean(searchResult && searchResult.trim())

        // Charge credits for web search usage
        let creditResult = null
        if (userId) {
          const creditsToCharge = Math.round(
            (depth === 'deep' ? 5 : 1) * (1 + PROFIT_MARGIN),
          )
          const requestContext = getRequestContext()
          const repoUrl = requestContext?.processedRepoUrl

          creditResult = await consumeCreditsWithFallback({
            userId,
            creditsToCharge,
            repoUrl,
            context: 'web search',
            logger,
          })

          if (!creditResult.success) {
            logger.error(
              {
                ...searchContext,
                error: creditResult.error,
                creditsToCharge,
                searchDuration,
              },
              'Failed to charge credits for web search',
            )
          }
        }

        logger.info(
          {
            ...searchContext,
            searchDuration,
            resultLength,
            hasResults,
            creditsCharged: creditResult?.success
              ? depth === 'deep'
                ? 5
                : 1
              : 0,
            success: true,
          },
          'Search completed',
        )

        if (searchResult) {
          return [
            {
              type: 'json',
              value: { result: searchResult },
            },
          ]
        } else {
          logger.warn(
            {
              ...searchContext,
              searchDuration,
            },
            'No results returned from search API',
          )
          return [
            {
              type: 'json',
              value: {
                errorMessage: `No search results found for "${query}". Try refining your search query or using different keywords.`,
              },
            },
          ]
        }
      } catch (error) {
        const searchDuration = Date.now() - searchStartTime
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
            searchDuration,
            success: false,
          },
          'Search failed with error',
        )
        return [
          {
            type: 'json',
            value: {
              errorMessage: `Error performing web search for "${query}": ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            },
          },
        ]
      }
    })()

  return {
    result: (async () => {
      await previousToolCallFinished
      return await webSearchPromise
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'web_search'>
