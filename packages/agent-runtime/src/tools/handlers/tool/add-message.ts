import { assistantMessage, userMessage } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

export const handleAddMessage = (({
  previousToolCallFinished,
  toolCall,

  agentState,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'add_message'>

  agentState: AgentState
}): {
  result: Promise<CodebuffToolOutput<'add_message'>>
  state: {}
} => {
  return {
    result: (async () => {
      await previousToolCallFinished

      agentState.messageHistory.push(
        toolCall.input.role === 'user'
          ? userMessage(toolCall.input.content)
          : assistantMessage(toolCall.input.content),
      )
      return []
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'add_message'>
