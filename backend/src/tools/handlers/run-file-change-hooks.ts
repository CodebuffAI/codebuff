import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'

export const handleRunFileChangeHooks = (async (params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'run_file_change_hooks'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'run_file_change_hooks'>
  ) => Promise<string>
}): Promise<{ result: string; state: {} }> => {
  const { previousToolCallResult, toolCall, requestClientToolCall } = params

  await previousToolCallResult
  return { result: await requestClientToolCall(toolCall), state: {} }
}) satisfies CodebuffToolHandlerFunction<'run_file_change_hooks'>
