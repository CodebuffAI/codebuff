import { jsonToolResult } from '@codebuff/common/util/messages'

import { callDocsSearchAPI } from '../../../llm-api/codebuff-web-api'
import { validateToolHandler } from '../handler-function-type'

import type { fetchContext7LibraryDocumentation } from '../../../llm-api/context7-api'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

type ToolName = 'read_docs'
export const handleReadDocs = validateToolHandler<ToolName>(
  async (
    params: {
      previousToolCallFinished: Promise<void>
      toolCall: CodebuffToolCall<ToolName>

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
    output: CodebuffToolOutput<ToolName>
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

    let creditsUsed = 0
    try {
      const viaWebApi = await callDocsSearchAPI({
        libraryTitle,
        topic,
        maxTokens: max_tokens,
        repoUrl: null,
        logger,
        fetch,
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
  },
)
