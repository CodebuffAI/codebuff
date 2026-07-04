import { buildArray } from '@codebirds/common/util/array'
import { jsonToolResult } from '@codebirds/common/util/messages'

import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'
import type { Subgoal } from '@codebirds/common/types/session-state'

export const handleAddSubgoal = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebirdsToolCall<'add_subgoal'>

  agentContext: Record<string, Subgoal>
}): Promise<{
  output: CodebirdsToolOutput<'add_subgoal'>
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
}) satisfies CodebirdsToolHandlerFunction<'add_subgoal'>
