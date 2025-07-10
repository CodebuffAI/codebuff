import { CodebuffToolCall } from '../constants'
import { Subgoal } from './add-subgoal'

export async function handleUpdateSubgoal(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'update_subgoal'>
  extra: { agentContext: Record<string, Subgoal> }
}): Promise<Record<string, Subgoal>> {
  const { previousToolCallResult, toolCall, extra } = params
  const { agentContext } = extra

  await previousToolCallResult

  const newAgentContext = { ...agentContext }
  if (!newAgentContext[toolCall.args.id]) {
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
  return newAgentContext
}
