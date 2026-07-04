import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'

type ToolName = 'glob'
export const handleGlob = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebirdsToolCall<ToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<CodebirdsToolOutput<ToolName>>
}): Promise<{
  output: CodebirdsToolOutput<ToolName>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies CodebirdsToolHandlerFunction<ToolName>
