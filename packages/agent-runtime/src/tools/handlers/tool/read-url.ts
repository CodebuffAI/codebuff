import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleReadUrl = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'read_url'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'read_url'>,
  ) => Promise<CodebuffToolOutput<'read_url'>>
}): Promise<{
  output: CodebuffToolOutput<'read_url'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebuffToolHandlerFunction<'read_url'>
