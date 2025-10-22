import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'run_file_change_hooks'
export const handleRunFileChangeHooks = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<CodebuffToolOutput<ToolName>>
}): { result: Promise<CodebuffToolOutput<ToolName>>; state: {} } => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  return {
    result: (async () => {
      await previousToolCallFinished
      return await requestClientToolCall(toolCall)
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'run_file_change_hooks'>
