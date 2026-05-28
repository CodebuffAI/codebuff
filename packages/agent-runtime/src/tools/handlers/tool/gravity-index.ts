import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleGravityIndex = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'gravity_index'>
  logger: Logger

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  repoId: string | undefined
  userInputId: string
  userId: string | undefined
}): Promise<{
  output: CodebuffToolOutput<'gravity_index'>
  creditsUsed: number
}> => {
  const {
    previousToolCallFinished,
    toolCall,
    agentStepId,
    logger,
    repoId,
    userId,
    userInputId,
  } = params
  const { action } = toolCall.input

  const startedAt = Date.now()

  await previousToolCallFinished

  const creditsUsed = 0
  logger.warn(
    {
      toolCallId: toolCall.toolCallId,
      action,
      userId,
      agentStepId,
      repoId,
      durationMs: Date.now() - startedAt,
    },
    'Gravity Index not available in openbuff BYOK mode',
  )
  return {
    output: jsonToolResult({
      errorMessage: `Gravity Index action "${action}" is not available in openbuff BYOK mode.`,
    }),
    creditsUsed,
  }
}) satisfies CodebuffToolHandlerFunction<'gravity_index'>
