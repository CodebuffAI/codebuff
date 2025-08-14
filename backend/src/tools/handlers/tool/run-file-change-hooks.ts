import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
} from '@codebuff/common/tools/list'

export const handleRunFileChangeHooks = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'run_file_change_hooks'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'run_file_change_hooks'>,
  ) => Promise<string>
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  return {
    result: previousToolCallFinished.then(() =>
      requestClientToolCall(toolCall),
    ),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'run_file_change_hooks'>
