import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

type ToolName = 'set_messages'
export const handleSetMessages = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    agentState: AgentState
  }): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const { previousToolCallFinished, toolCall, agentState } = params

    await previousToolCallFinished
    agentState.messageHistory = toolCall.input.messages
    return { output: [] }
  },
)
