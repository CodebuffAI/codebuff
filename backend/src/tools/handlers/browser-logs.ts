import { ClientToolCall, CodebuffToolCall } from '../constants'

export async function handleBrowserLogs(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'browser_logs'>
  extra: {
    requestClientToolCall: (
      toolCall: ClientToolCall<'browser_logs'>
    ) => Promise<string>
  }
}): Promise<string> {
  const { previousToolCallResult, toolCall, extra } = params
  const { requestClientToolCall } = extra

  await previousToolCallResult
  return await requestClientToolCall(toolCall)
}
