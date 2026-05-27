import { jsonToolResult } from '@codebuff/common/util/messages'

import { callDocsSearchAPI } from '../../../llm-api/codebuff-web-api'
import { fetchContext7LibraryDocumentation } from '../../../llm-api/context7-api'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ClientEnv, CiEnv } from '@codebuff/common/types/contracts/env'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

export const handleReadDocs = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'read_docs'>

    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    logger: Logger
    repoId: string | undefined
    userId: string | undefined
    userInputId: string
    clientEnv: ClientEnv
    ciEnv: CiEnv
    localMode?: boolean
  } & ParamsExcluding<
    typeof fetchContext7LibraryDocumentation,
    'query' | 'topic' | 'tokens'
  >,
): Promise<{
  output: CodebuffToolOutput<'read_docs'>
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

    fetch,
    clientEnv,
    ciEnv,
    localMode,
  } = params
  const { libraryTitle, topic, max_tokens } = toolCall.input

  const docsStartTime = Date.now()
  const docsContext = {
    toolCallId: toolCall.toolCallId,
    libraryTitle,
    topic,
    max_tokens,
    userId,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    repoId,
  }

  await previousToolCallFinished

  let creditsUsed = 0

  const fetchDocsDirectly = async () => {
    const documentation = await fetchContext7LibraryDocumentation({
      query: libraryTitle,
      topic,
      tokens: max_tokens,
      logger,
      fetch,
    })

    if (typeof documentation !== 'string') {
      const docMsg = `No documentation found for "${libraryTitle}"${topic ? ` (topic: ${topic})` : ''}`
      return {
        output: jsonToolResult({
          documentation: docMsg,
          errorMessage: docMsg,
        }),
        creditsUsed,
      }
    }

    const docsDuration = Date.now() - docsStartTime
    const resultLength = documentation.length
    const estimatedTokens = Math.ceil(resultLength / 4)
    logger.info(
      {
        ...docsContext,
        docsDuration,
        resultLength,
        estimatedTokens,
        hasResults: Boolean(documentation.trim()),
        usedWebApi: false,
        creditsUsed,
        success: true,
      },
      'Documentation request completed successfully via Context7 API',
    )

    return {
      output: jsonToolResult({ documentation }),
      creditsUsed,
    }
  }

  try {
    if (localMode || !ciEnv.CODEBUFF_API_KEY) {
      return await fetchDocsDirectly()
    }

    const viaWebApi = await callDocsSearchAPI({
      libraryTitle,
      topic,
      maxTokens: max_tokens,
      repoUrl: null,
      logger,
      fetch,
      env: { clientEnv, ciEnv },
    })

    if (viaWebApi.error || typeof viaWebApi.documentation !== 'string') {
      const docsDuration = Date.now() - docsStartTime
      const docMsg = `Error fetching documentation for "${libraryTitle}"${topic ? ` (topic: ${topic})` : ''}: ${viaWebApi.error}`
      logger.warn(
        {
          ...docsContext,
          docsDuration,
          usedWebApi: true,
          success: false,
          error: viaWebApi.error,
        },
        'Web API docs returned error',
      )
      return {
        output: jsonToolResult({
          documentation: docMsg,
          ...(viaWebApi.error && { errorMessage: viaWebApi.error }),
        }),
        creditsUsed,
      }
    }

    const docsDuration = Date.now() - docsStartTime
    const resultLength = viaWebApi.documentation?.length || 0
    const hasResults = Boolean(
      viaWebApi.documentation && viaWebApi.documentation.trim(),
    )
    const estimatedTokens = Math.ceil(resultLength / 4)

    // Capture credits used from the API response
    if (typeof viaWebApi.creditsUsed === 'number') {
      creditsUsed = viaWebApi.creditsUsed
    }

    logger.info(
      {
        ...docsContext,
        docsDuration,
        resultLength,
        estimatedTokens,
        hasResults,
        usedWebApi: true,
        creditsUsed,
        success: true,
      },
      'Documentation request completed successfully via web API',
    )
    return {
      output: jsonToolResult({ documentation: viaWebApi.documentation }),
      creditsUsed,
    }
  } catch (error) {
    const docsDuration = Date.now() - docsStartTime
    const errMsg = `Error fetching documentation for "${libraryTitle}": ${
      error instanceof Error ? error.message : 'Unknown error'
    }`
    logger.error(
      {
        ...docsContext,
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        docsDuration,
        success: false,
      },
      'Documentation request failed with error',
    )
    return {
      output: jsonToolResult({ documentation: errMsg, errorMessage: errMsg }),
      creditsUsed,
    }
  }
}) satisfies CodebuffToolHandlerFunction<'read_docs'>
