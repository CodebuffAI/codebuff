import { assistantMessage, userMessage } from '@codebirds/common/util/messages'

import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'
import type { AgentState } from '@codebirds/common/types/session-state'

export const handleAddMessage = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebirdsToolCall<'add_message'>

  agentState: AgentState
}): Promise<{
  output: CodebirdsToolOutput<'add_message'>
}> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentState,
  } = params

  await previousToolCallFinished

  agentState.messageHistory.push(
    toolCall.input.role === 'user'
      ? userMessage(toolCall.input.content)
      : assistantMessage(toolCall.input.content),
  )

  return { output: [{ type: 'json', value: { message: 'Message added.' } }] }
}) satisfies CodebirdsToolHandlerFunction<'add_message'>
