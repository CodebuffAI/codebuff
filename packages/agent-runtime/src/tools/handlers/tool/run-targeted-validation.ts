import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'run_targeted_validation'

export const handleRunTargetedValidation = (async ({
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
    toolName: 'run_targeted_validation',
    toolCallId: toolCall.toolCallId,
    input: {
      snapshot_id: toolCall.input.snapshot_id,
      files: toolCall.input.files,
      artifact_kinds: toolCall.input.artifact_kinds,
    },
  }
  await previousToolCallFinished
  return { output: await requestClientToolCall(clientToolCall) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
