import { ClientToolCall, CodebuffToolCall } from '../constants'

export async function handleCodeSearch(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'code_search'>
  extra: {
    requestClientToolCall: (
      toolCall: ClientToolCall<'code_search'>
    ) => Promise<string>
  }
}): Promise<string> {
  const { previousToolCallResult, toolCall, extra } = params
  const { requestClientToolCall } = extra

  await previousToolCallResult
  return await requestClientToolCall(toolCall)
}
