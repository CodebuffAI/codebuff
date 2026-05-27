import { jsonToolResult } from '@codebuff/common/util/messages'

import { callWebSearchAPI } from '../../../llm-api/codebuff-web-api'
import { searchWeb } from '../../../llm-api/linkup-api'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleWebSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'web_search'>
  logger: Logger
  apiKey: string

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  repoUrl: string | undefined
  userInputId: string
  userId: string | undefined

  fetch: typeof globalThis.fetch
  clientEnv: ClientEnv
  ciEnv: CiEnv
  localMode?: boolean
}): Promise<{
  output: CodebuffToolOutput<'web_search'>
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
    repoUrl,
    userId,
    userInputId,

    fetch,
    clientEnv,
    ciEnv,
    localMode,
  } = params
  const { query, depth } = toolCall.input

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

  await previousToolCallFinished

  let creditsUsed = 0

  const searchDirectly = async () => {
    const result = await searchWeb({
      query,
      depth,
      logger,
      fetch,
      serverEnv: { LINKUP_API_KEY: process.env.LINKUP_API_KEY ?? '' },
    })

    if (result === null) {
      return {
        output: jsonToolResult({
          errorMessage: `No search results found for "${query}"`,
        }),
        creditsUsed,
      }
    }

    const searchDuration = Date.now() - searchStartTime
    const resultLength = result.length
    const hasResults = Boolean(result.trim())

    logger.info(
      {
        ...searchContext,
        searchDuration,
        resultLength,
        hasResults,
        usedWebApi: false,
        creditsUsed,
        success: true,
      },
      'Search completed via Linkup API',
    )

    return {
      output: jsonToolResult({ result }),
      creditsUsed,
    }
  }

  try {
    if (localMode || !ciEnv.CODEBUFF_API_KEY) {
      return await searchDirectly()
    }

    const webApi = await callWebSearchAPI({
      query,
      depth,
      repoUrl: repoUrl ?? null,
      fetch,
      logger,
      apiKey,
      env: { clientEnv, ciEnv },
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
      return {
        output: jsonToolResult({
          errorMessage: webApi.error,
        }),
        creditsUsed,
      }
    }
    const searchDuration = Date.now() - searchStartTime
    const resultLength = webApi.result?.length || 0
    const hasResults = Boolean(webApi.result && webApi.result.trim())

    // Capture credits used from the API response
    if (typeof webApi.creditsUsed === 'number') {
      creditsUsed = webApi.creditsUsed
    }

    logger.info(
      {
        ...searchContext,
        searchDuration,
        resultLength,
        hasResults,
        usedWebApi: true,
        creditsCharged: 'server',
        creditsUsed,
        success: true,
      },
      'Search completed via web API',
    )

    return {
      output: jsonToolResult({ result: webApi.result ?? '' }),
      creditsUsed,
    }
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
    return { output: jsonToolResult({ errorMessage }), creditsUsed }
  }
}) satisfies CodebuffToolHandlerFunction<'web_search'>
