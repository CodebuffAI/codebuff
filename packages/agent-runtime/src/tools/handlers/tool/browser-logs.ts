import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'

export const handleBrowserLogs = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebirdsToolCall<'browser_logs'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'browser_logs'>,
  ) => Promise<CodebirdsToolOutput<'browser_logs'>>
}): Promise<{
  output: CodebirdsToolOutput<'browser_logs'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebirdsToolHandlerFunction<'browser_logs'>
