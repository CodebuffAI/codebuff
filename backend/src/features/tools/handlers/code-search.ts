import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'

export const handleCodeSearch = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'code_search'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'code_search'>
  ) => Promise<string>
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  return {
    result: previousToolCallFinished.then(() =>
      requestClientToolCall(toolCall)
    ),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'code_search'>
