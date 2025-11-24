import { validateToolHandler } from '../handler-function-type'

import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'code_search'
export const handleCodeSearch = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'code_search'>
    requestClientToolCall: (
      toolCall: ClientToolCall<'code_search'>,
    ) => Promise<CodebuffToolOutput<'code_search'>>
  }): Promise<{
    output: CodebuffToolOutput<'code_search'>
  }> => {
    const { previousToolCallFinished, toolCall, requestClientToolCall } = params

    await previousToolCallFinished
    return { output: await requestClientToolCall(toolCall) }
  },
)
