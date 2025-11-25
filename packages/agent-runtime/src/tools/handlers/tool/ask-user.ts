import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'ask_user'

// Handler for ask_user - delegates to client
export const handleAskUser = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  requestClientToolCall: (toolCall: any) => Promise<any>
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished

  const result = await requestClientToolCall(toolCall as any)
  return {
    output: result,
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
