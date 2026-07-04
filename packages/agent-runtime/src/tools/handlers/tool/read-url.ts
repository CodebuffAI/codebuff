import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'

export const handleReadUrl = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebirdsToolCall<'read_url'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'read_url'>,
  ) => Promise<CodebirdsToolOutput<'read_url'>>
}): Promise<{
  output: CodebirdsToolOutput<'read_url'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebirdsToolHandlerFunction<'read_url'>
