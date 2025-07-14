import { Subgoal } from '@codebuff/common/types/session-state'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleUpdateSubgoal = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'update_subgoal'>
  state: { mutableState?: { agentContext: Record<string, Subgoal> } }
}): {
  result: Promise<string>
  state: { mutableState: { agentContext: Record<string, Subgoal> } }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const mutableState = state.mutableState ?? { agentContext: {} }
  const { agentContext } = mutableState
  console.log({ state }, 'asdf')

  let messages: string[] = []
  if (!agentContext[toolCall.args.id]) {
    messages.push(
      `Subgoal with id ${toolCall.args.id} not found. Creating new subgoal.`
    )
    agentContext[toolCall.args.id] = {
      objective: undefined,
      status: undefined,
      plan: undefined,
      logs: [],
    }
  }
  if (toolCall.args.status) {
    agentContext[toolCall.args.id].status = toolCall.args.status
  }
  if (toolCall.args.plan) {
    agentContext[toolCall.args.id].plan = toolCall.args.plan
  }
  if (toolCall.args.log) {
    agentContext[toolCall.args.id].logs.push(toolCall.args.log)
  }
  messages.push('Successfully updated subgoal.')
  return {
    result: previousToolCallFinished.then(() => messages.join('\n\n')),
    state: { mutableState },
  }
}) satisfies CodebuffToolHandlerFunction<'update_subgoal'>
