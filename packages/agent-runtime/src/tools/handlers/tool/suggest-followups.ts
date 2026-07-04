import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'
import type { Logger } from '@codebirds/common/types/contracts/logger'

export const handleSuggestFollowups = (async (params: {
  previousToolCallFinished: Promise<unknown>
  toolCall: CodebirdsToolCall<'suggest_followups'>
  logger: Logger
}): Promise<{ output: CodebirdsToolOutput<'suggest_followups'> }> => {
  const { previousToolCallFinished, toolCall } = params
  const { followups: _followups } = toolCall.input

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Followups suggested!' } }] }
}) satisfies CodebirdsToolHandlerFunction<'suggest_followups'>
