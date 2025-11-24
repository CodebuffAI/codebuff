import { validateToolHandler } from '../handler-function-type'

import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'run_file_change_hooks'
export const handleRunFileChangeHooks = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>
    requestClientToolCall: (
      toolCall: ClientToolCall<ToolName>,
    ) => Promise<CodebuffToolOutput<ToolName>>
  }): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const { previousToolCallFinished, toolCall, requestClientToolCall } = params

    await previousToolCallFinished
    return { output: await requestClientToolCall(toolCall) }
  },
)
