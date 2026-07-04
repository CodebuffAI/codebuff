import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'

export const handleCodeSearch = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebirdsToolCall<'code_search'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'code_search'>,
  ) => Promise<CodebirdsToolOutput<'code_search'>>
}): Promise<{
  output: CodebirdsToolOutput<'code_search'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebirdsToolHandlerFunction<'code_search'>
