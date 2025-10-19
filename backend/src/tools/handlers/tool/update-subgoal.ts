import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Subgoal } from '@codebuff/common/types/session-state'

type ToolName = 'update_subgoal'
export const handleUpdateSubgoal = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  state: { agentContext?: Record<string, Subgoal> }
}): {
  result: Promise<CodebuffToolOutput<ToolName>>
  state: { agentContext: Record<string, Subgoal> }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const agentContext = state.agentContext ?? {}

  let messages: string[] = []
  if (!agentContext[toolCall.input.id]) {
    messages.push(
      `Subgoal with id ${toolCall.input.id} not found. Creating new subgoal.`,
    )
    agentContext[toolCall.input.id] = {
      objective: undefined,
      status: undefined,
      plan: undefined,
      logs: [],
    }
  }
  if (toolCall.input.status) {
    agentContext[toolCall.input.id].status = toolCall.input.status
  }
  if (toolCall.input.plan) {
    agentContext[toolCall.input.id].plan = toolCall.input.plan
  }
  if (toolCall.input.log) {
    agentContext[toolCall.input.id].logs.push(toolCall.input.log)
  }
  messages.push('Successfully updated subgoal.')
  return {
    result: (async () => {
      await previousToolCallFinished
      return [
        {
          type: 'json',
          value: {
            message: messages.join('\n\n'),
          },
        },
      ]
    })(),
    state: { agentContext },
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
