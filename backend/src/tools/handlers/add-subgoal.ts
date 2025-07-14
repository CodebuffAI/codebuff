import { Subgoal } from '@codebuff/common/types/session-state'
import { buildArray } from '@codebuff/common/util/array'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleAddSubgoal = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'add_subgoal'>
  state: { mutableState?: { agentContext: Record<string, Subgoal> } }
}): {
  result: Promise<string>
  state: { mutableState: { agentContext: Record<string, Subgoal> } }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const mutableState = state.mutableState ?? { agentContext: {} }
  const { agentContext } = mutableState

  agentContext[toolCall.args.id] = {
    objective: toolCall.args.objective,
    status: toolCall.args.status,
    plan: toolCall.args.plan,
    logs: buildArray([toolCall.args.log]),
  }

  return {
    result: previousToolCallFinished.then(() => 'Successfully added subgoal'),
    state: { mutableState },
  }
}) satisfies CodebuffToolHandlerFunction<'add_subgoal'>
