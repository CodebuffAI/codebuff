import { jsonToolResult } from '@codebuff/common/util/messages'

import { fetchContext7LibraryDocumentation } from '../../../llm-api/context7-api'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
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

  const creditsUsed = 0

  try {
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
        creditsUsed,
        success: true,
      },
      'Documentation request completed successfully via Context7 API',
    )

    return {
      output: jsonToolResult({ documentation }),
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
