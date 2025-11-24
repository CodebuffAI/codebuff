import { assistantMessage, userMessage } from '@codebuff/common/util/messages'

import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

type ToolName = 'add_message'
export const handleAddMessage = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    agentState: AgentState
  }): Promise<{
    output: CodebuffToolOutput<ToolName>
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

    return { output: [] }
  },
)
