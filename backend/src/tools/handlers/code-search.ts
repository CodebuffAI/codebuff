import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'

export const handleCodeSearch = (async (params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'code_search'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'code_search'>
  ) => Promise<string>
}): Promise<{ result: string; state: {} }> => {
  const { previousToolCallResult, toolCall, requestClientToolCall } = params

  await previousToolCallResult
  return { result: await requestClientToolCall(toolCall), state: {} }
}) satisfies CodebuffToolHandlerFunction<'code_search'>
