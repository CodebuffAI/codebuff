import { buildArray } from '@codebuff/common/util/array'
import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Subgoal } from '@codebuff/common/types/session-state'

export const handleAddSubgoal = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'add_subgoal'>

  agentContext: Record<string, Subgoal>
}): Promise<{
  output: CodebuffToolOutput<'add_subgoal'>
}> => {
  const { previousToolCallFinished, toolCall, agentContext } = params

  agentContext[toolCall.input.id] = {
    objective: toolCall.input.objective,
    status: toolCall.input.status,
    plan: toolCall.input.plan,
    logs: buildArray([toolCall.input.log]),
  }

  await previousToolCallFinished
  return { output: jsonToolResult({ message: 'Successfully added subgoal' }) }
}) satisfies CodebuffToolHandlerFunction<'add_subgoal'>
