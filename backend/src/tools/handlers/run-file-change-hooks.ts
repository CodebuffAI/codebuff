import { ClientToolCall, CodebuffToolCall } from '../constants'

export async function handleRunFileChangeHooks(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'run_file_change_hooks'>
  extra: {
    requestClientToolCall: (
      toolCall: ClientToolCall<'run_file_change_hooks'>
    ) => Promise<string>
  }
}): Promise<string> {
  const { previousToolCallResult, toolCall, extra } = params
  const { requestClientToolCall } = extra

  await previousToolCallResult
  return await requestClientToolCall(toolCall)
}
