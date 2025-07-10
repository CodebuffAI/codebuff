import { buildArray } from '@codebuff/common/util/array'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export type Subgoal = {
  objective: string | undefined
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'ABORTED' | undefined
  plan: string | undefined
  logs: string[]
}

export const handleAddSubgoal = (async (params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'add_subgoal'>
  state: { agentContext?: Record<string, Subgoal> }
}): Promise<{
  result: string
  state: { agentContext: Record<string, Subgoal> }
}> => {
  const { previousToolCallResult, toolCall, state } = params
  const { agentContext } = state

  await previousToolCallResult
  return {
    result: 'Successfully added subgoal.',
    state: {
      agentContext: {
        ...agentContext,
        [toolCall.args.id]: {
          objective: toolCall.args.objective,
          status: toolCall.args.status,
          plan: toolCall.args.plan,
          logs: buildArray([toolCall.args.log]),
        },
      },
    },
  }
}) satisfies CodebuffToolHandlerFunction<'add_subgoal'>
