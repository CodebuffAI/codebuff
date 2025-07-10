import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'

export const handleBrowserLogs = (async (params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'browser_logs'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'browser_logs'>
  ) => Promise<string>
}): Promise<{ result: string; state: {} }> => {
  const { previousToolCallResult, toolCall, requestClientToolCall } = params

  await previousToolCallResult
  return { result: await requestClientToolCall(toolCall), state: {} }
}) satisfies CodebuffToolHandlerFunction<'browser_logs'>
