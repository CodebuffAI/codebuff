import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleReplaceRange = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}) => {
  await previousToolCallFinished
  const clientToolCall = {
    toolCallId: toolCall.toolCallId,
    toolName: 'replace_range' as const,
    input: toolCall.input,
  }
  return {
    output: await requestClientToolCall(clientToolCall),
  }
}) satisfies CodebuffToolHandlerFunction<'replace_range'>
