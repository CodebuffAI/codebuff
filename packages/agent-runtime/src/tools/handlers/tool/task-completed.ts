import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'task_completed'
export const handleTaskCompleted = validateToolHandler<ToolName>(
  async ({
    previousToolCallFinished,
  }: {
    previousToolCallFinished: Promise<any>
    toolCall: CodebuffToolCall<ToolName>
  }): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    await previousToolCallFinished
    return { output: [] }
  },
)
