import { jsonToolResult } from '@codebuff/common/util/messages'

import { callGravityIndexSearchAPI } from '../../../llm-api/codebuff-web-api'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleGravityIndexSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'gravity_index_search'>
  logger: Logger
  apiKey: string

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  userInputId: string
  userId: string | undefined

  fetch: typeof globalThis.fetch
  clientEnv: ClientEnv
  ciEnv: CiEnv
}): Promise<{
  output: CodebuffToolOutput<'gravity_index_search'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,
    agentStepId,
    apiKey,
    clientSessionId,
    fingerprintId,
    logger,
    repoId,
    userId,
    userInputId,
    fetch,
    clientEnv,
    ciEnv,
  } = params
  const { query } = toolCall.input

  const startedAt = Date.now()
  const searchContext = {
    toolCallId: toolCall.toolCallId,
    query,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  let creditsUsed = 0
  try {
    const webApi = await callGravityIndexSearchAPI({
      query,
      fetch,
      logger,
      apiKey,
      env: { clientEnv, ciEnv },
    })

    if (webApi.error || !webApi.result) {
      logger.warn(
        {
          ...searchContext,
          durationMs: Date.now() - startedAt,
          success: false,
          error: webApi.error,
        },
        'Gravity Index search returned error',
      )
      return {
        output: jsonToolResult({
          errorMessage: webApi.error ?? 'Invalid Gravity Index response',
        }),
        creditsUsed,
      }
    }

    if (typeof webApi.creditsUsed === 'number') {
      creditsUsed = webApi.creditsUsed
    }

    logger.info(
      {
        ...searchContext,
        durationMs: Date.now() - startedAt,
        recommendation:
          typeof webApi.result.recommendation === 'object'
            ? webApi.result.recommendation
            : undefined,
        creditsUsed,
        success: true,
      },
      'Gravity Index search completed via web API',
    )

    return {
      output: jsonToolResult(webApi.result),
      creditsUsed,
    }
  } catch (error) {
    const errorMessage = `Error searching Gravity Index for "${query}": ${
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
        durationMs: Date.now() - startedAt,
        success: false,
      },
      'Gravity Index search failed with error',
    )
    return { output: jsonToolResult({ errorMessage }), creditsUsed }
  }
}) satisfies CodebuffToolHandlerFunction<'gravity_index_search'>
