import { jsonToolResult } from '@codebuff/common/util/messages'

import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'write_todos'
export const handleWriteTodos = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>
  }): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const { previousToolCallFinished, toolCall } = params
    const { todos } = toolCall.input

    await previousToolCallFinished
    return { output: jsonToolResult({ todos }) }
  },
)
