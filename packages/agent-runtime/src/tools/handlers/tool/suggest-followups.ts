import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleSuggestFollowups = (async (params: {
  previousToolCallFinished: Promise<unknown>
  toolCall: CodebuffToolCall<'suggest_followups'>
  logger: Logger
}): Promise<{ output: CodebuffToolOutput<'suggest_followups'> }> => {
  const { previousToolCallFinished, toolCall, logger } = params
  const { followups } = toolCall.input

  logger.debug(
    {
      followupCount: followups.length,
    },
    'Suggested followups',
  )

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Followups suggested!' } }] }
}) satisfies CodebuffToolHandlerFunction<'suggest_followups'>
