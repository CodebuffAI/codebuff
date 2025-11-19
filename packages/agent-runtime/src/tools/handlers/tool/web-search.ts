import { callWebSearchAPI } from '../../../llm-api/codebuff-web-api'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ConsumeCreditsWithFallbackFn } from '@codebuff/common/types/contracts/billing'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleWebSearch = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'web_search'>
  logger: Logger
  apiKey: string

  agentStepId: string
  clientSessionId: string
  userInputId: string
  repoUrl: string | undefined

  state: {
    userId?: string
    fingerprintId?: string
    repoId?: string
  }
  fetch: typeof globalThis.fetch
  consumeCreditsWithFallback: ConsumeCreditsWithFallbackFn
}): { result: Promise<CodebuffToolOutput<'web_search'>>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
    logger,
    agentStepId,
    clientSessionId,
    userInputId,
    repoUrl,
    state,
    fetch,
    apiKey
  } = params
  const { query, depth } = toolCall.input
  const { userId, fingerprintId, repoId } = state

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

  let capturedCreditsUsed = 0
  const webSearchPromise: Promise<CodebuffToolOutput<'web_search'>> =
    (async () => {
      try {
        const webApi = await callWebSearchAPI({
          query,
          depth,
          repoUrl: repoUrl ?? null,
          fetch,
          logger,
          apiKey
        })

        if (webApi.error) {
          const searchDuration = Date.now() - searchStartTime
          logger.warn(
            {
              ...searchContext,
              searchDuration,
              usedWebApi: true,
              success: false,
              error: webApi.error,
            },
            'Web API search returned error',
          )
          return [
            {
              type: 'json',
              value: { errorMessage: webApi.error },
            },
          ]
        }
        const searchDuration = Date.now() - searchStartTime
        const resultLength = webApi.result?.length || 0
        const hasResults = Boolean(webApi.result && webApi.result.trim())

        // Capture credits used from the API response
        if (typeof webApi.creditsUsed === 'number') {
          capturedCreditsUsed = webApi.creditsUsed
        }

        logger.info(
          {
            ...searchContext,
            searchDuration,
            resultLength,
            hasResults,
            usedWebApi: true,
            creditsCharged: 'server',
            creditsUsed: capturedCreditsUsed,
            success: true,
          },
          'Search completed via web API',
        )

        return [
          {
            type: 'json',
            value: { result: webApi.result ?? '' },
          },
        ]
      } catch (error) {
        const searchDuration = Date.now() - searchStartTime
        const errorMessage = `Error performing web search for "${query}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
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
              errorMessage,
            },
          },
        ]
      }
    })()

  return {
    result: (async () => {
      await previousToolCallFinished
      const result = await webSearchPromise
      return result
    })(),
    state: {
      creditsUsed: (async () => {
        await webSearchPromise
        return capturedCreditsUsed
      })(),
    },
  }
}) satisfies CodebuffToolHandlerFunction<'web_search'>
