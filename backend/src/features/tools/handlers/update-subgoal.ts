import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'
import { Subgoal } from './add-subgoal'

export const handleUpdateSubgoal = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'update_subgoal'>
  state: { agentContext?: Record<string, Subgoal> }
}): {
  result: Promise<string>
  state: { agentContext: Record<string, Subgoal> }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const { agentContext } = state

  let messages: string[] = []
  const newAgentContext = { ...agentContext }
  if (!newAgentContext[toolCall.args.id]) {
    messages.push(
      `Subgoal with id ${toolCall.args.id} not found. Creating new subgoal.`
    )
    newAgentContext[toolCall.args.id] = {
      objective: undefined,
      status: undefined,
      plan: undefined,
      logs: [],
    }
  }
  if (toolCall.args.status) {
    newAgentContext[toolCall.args.id].status = toolCall.args.status
  }
  if (toolCall.args.plan) {
    newAgentContext[toolCall.args.id].plan = toolCall.args.plan
  }
  if (toolCall.args.log) {
    newAgentContext[toolCall.args.id].logs.push(toolCall.args.log)
  }
  messages.push('Successfully updated subgoal.')
  return {
    result: previousToolCallFinished.then(() => messages.join('\n\n')),
    state: { agentContext: newAgentContext },
  }
}) satisfies CodebuffToolHandlerFunction<'update_subgoal'>
