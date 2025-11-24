import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'end_turn'
export const handleEndTurn = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<any>
    toolCall: CodebuffToolCall<ToolName>
  }): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const { previousToolCallFinished } = params

    await previousToolCallFinished
    return { output: [] }
  },
)
