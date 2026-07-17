import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type ToolName = 'write_audit_findings'

export const handleWriteAuditFindings = (async ({
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
  await previousToolCallFinished
  return {
    output: await requestClientToolCall({
      toolName: 'write_audit_findings',
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
