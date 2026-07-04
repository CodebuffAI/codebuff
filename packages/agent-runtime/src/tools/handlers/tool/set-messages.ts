import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'
import type { AgentState } from '@codebirds/common/types/session-state'

export const handleSetMessages = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebirdsToolCall<'set_messages'>

  agentState: AgentState
}): Promise<{ output: CodebirdsToolOutput<'set_messages'> }> => {
  const { previousToolCallFinished, toolCall, agentState } = params

  await previousToolCallFinished
  agentState.messageHistory = toolCall.input.messages
  return { output: [{ type: 'json', value: { message: 'Messages set.' } }] }
}) satisfies CodebirdsToolHandlerFunction<'set_messages'>
