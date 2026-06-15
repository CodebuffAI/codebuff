import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleReadImage = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'read_image'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'read_image'>,
  ) => Promise<CodebuffToolOutput<'read_image'>>
}): Promise<{
  output: CodebuffToolOutput<'read_image'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebuffToolHandlerFunction<'read_image'>
