import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

export const handleSetMessages = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'set_messages'>

  agentState: AgentState
}): {
  result: Promise<CodebuffToolOutput<'set_messages'>>
  state: {}
} => {
  const { previousToolCallFinished, toolCall, agentState } = params

  return {
    result: (async () => {
      await previousToolCallFinished
      agentState.messageHistory = toolCall.input.messages
      return []
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'set_messages'>
