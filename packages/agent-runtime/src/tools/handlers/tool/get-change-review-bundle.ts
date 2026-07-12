import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'get_change_review_bundle'

export const handleGetChangeReviewBundle = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<CodebuffToolOutput<ToolName>>
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const clientToolCall: ClientToolCall<ToolName> = {
    toolName: 'get_change_review_bundle',
    toolCallId: toolCall.toolCallId,
    input: { max_chars: toolCall.input.max_chars },
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
