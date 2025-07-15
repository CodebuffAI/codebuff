import { fetchContext7LibraryDocumentation } from '../../llm-apis/context7-api'
import { logger } from '../../util/logger'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleReadDocs = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'read_docs'>
  agentStepId: string
  state: {
    userId?: string
    clientSessionId?: string
    fingerprintId?: string
    userInputId?: string
    repoId?: string
  }
}): {
  result: Promise<string>
  state: {}
} => {
  const { previousToolCallFinished, toolCall, agentStepId, state } = params
  const { libraryTitle, topic, max_tokens } = toolCall.args
  const { userId, clientSessionId, fingerprintId, userInputId, repoId } = state
  if (!userId) {
    throw new Error('Internal error for read_docs: Missing userId in state')
  }
  if (!clientSessionId) {
    throw new Error(
      'Internal error for read_docs: Missing clientSessionId in state'
    )
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for read_docs: Missing fingerprintId in state'
    )
  }
  if (!userInputId) {
    throw new Error(
      'Internal error for read_docs: Missing userInputId in state'
    )
  }

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

  const documentationPromise = (async () => {
    try {
      const documentation = await fetchContext7LibraryDocumentation(
        libraryTitle,
        {
          topic,
          tokens: max_tokens,
        }
      )

      const docsDuration = Date.now() - docsStartTime
      const resultLength = documentation?.length || 0
      const hasResults = Boolean(documentation && documentation.trim())
      const estimatedTokens = Math.ceil(resultLength / 4)

      logger.info(
        {
          ...docsContext,
          docsDuration,
          resultLength,
          estimatedTokens,
          hasResults,
          success: true,
        },
        'Documentation request completed successfully'
      )

      if (documentation) {
        return documentation
      } else {
        logger.warn(
          {
            ...docsContext,
            docsDuration,
          },
          'No documentation found in Context7 database'
        )
        return `No documentation found for "${libraryTitle}"${
          topic ? ` with topic "${topic}"` : ''
        }. Try using the exact library name (e.g., "Next.js", "React", "MongoDB"). The library may not be available in Context7's database.`
      }
    } catch (error) {
      const docsDuration = Date.now() - docsStartTime
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
        'Documentation request failed with error'
      )
      return `Error fetching documentation for "${libraryTitle}": ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    }
  })()

  return {
    result: (async () => {
      await previousToolCallFinished
      return await documentationPromise
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'read_docs'>
