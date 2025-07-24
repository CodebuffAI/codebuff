import type { ClientToolCall, CodebuffToolCall } from '../../constants'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleBrowserLogs = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'browser_logs'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'browser_logs'>
  ) => Promise<string>
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  return {
    result: previousToolCallFinished.then(() =>
      requestClientToolCall(toolCall)
    ),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'browser_logs'>
