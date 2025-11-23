import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleBrowserLogs = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'browser_logs'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'browser_logs'>,
  ) => Promise<CodebuffToolOutput<'browser_logs'>>
}): Promise<{
  output: CodebuffToolOutput<'browser_logs'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebuffToolHandlerFunction<'browser_logs'>
