import { buildArray } from '@codebuff/common/util/array'
import { CodebuffToolCall } from '../constants'

export type Subgoal = {
  objective: string | undefined
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'ABORTED' | undefined
  plan: string | undefined
  logs: string[]
}

export async function handleAddSubgoal(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'add_subgoal'>
  extra: { agentContext: Record<string, Subgoal> }
}): Promise<Record<string, Subgoal>> {
  const { previousToolCallResult, toolCall, extra } = params
  const { agentContext } = extra

  await previousToolCallResult
  return {
    ...agentContext,
    [toolCall.args.id]: {
      objective: toolCall.args.objective,
      status: toolCall.args.status,
      plan: toolCall.args.plan,
      logs: buildArray([toolCall.args.log]),
    },
  }
}
