import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { ClientToolCall, CodebuffToolCall, CodebuffToolOutput } from '@codebuff/common/tools/list'
type ToolName = 'get_build_targets'
export const handleGetBuildTargets = (async ({ previousToolCallFinished, toolCall, requestClientToolCall }: { previousToolCallFinished: Promise<void>; toolCall: CodebuffToolCall<ToolName>; requestClientToolCall: (toolCall: ClientToolCall<ToolName>) => Promise<CodebuffToolOutput<ToolName>> }) => {
  await previousToolCallFinished
  return { output: await requestClientToolCall({ toolName: 'get_build_targets', toolCallId: toolCall.toolCallId, input: { files: toolCall.input.files } }) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
