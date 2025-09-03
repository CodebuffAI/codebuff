import { buildArray } from '@codebuff/common/util/array'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Subgoal } from '@codebuff/common/types/session-state'

export const handleAddSubgoal = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'add_subgoal'>
  state: { agentContext?: Record<string, Subgoal> }
}): {
  result: Promise<CodebuffToolOutput<'add_subgoal'>>
  state: { agentContext: Record<string, Subgoal> }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const agentContext = state.agentContext ?? {}

  agentContext[toolCall.input.id] = {
    objective: toolCall.input.objective,
    status: toolCall.input.status,
    plan: toolCall.input.plan,
    logs: buildArray([toolCall.input.log]),
  }

  return {
    result: (async () => {
      await previousToolCallFinished
      return [
        {
          type: 'json',
          value: {
            message: 'Successfully added subgoal',
          },
        },
      ]
    })(),
    state: { agentContext },
  }
}) satisfies CodebuffToolHandlerFunction<'add_subgoal'>
