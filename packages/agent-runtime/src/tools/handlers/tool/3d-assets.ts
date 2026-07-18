import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

type InspectToolName = 'inspect_3d_asset'
export const handleInspect3dAsset = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<InspectToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<InspectToolName>,
  ) => Promise<CodebuffToolOutput<InspectToolName>>
}) => {
  await previousToolCallFinished
  return {
    output: await requestClientToolCall({
      toolName: 'inspect_3d_asset',
      toolCallId: toolCall.toolCallId,
      input: { path: toolCall.input.path },
    }),
  }
}) satisfies CodebuffToolHandlerFunction<InspectToolName>

type PreviewToolName = 'render_3d_preview'
export const handleRender3dPreview = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<PreviewToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<PreviewToolName>,
  ) => Promise<CodebuffToolOutput<PreviewToolName>>
}) => {
  await previousToolCallFinished
  return {
    output: await requestClientToolCall({
      toolName: 'render_3d_preview',
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<PreviewToolName>

type EditToolName = 'edit_3d_asset'
export const handleEdit3dAsset = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<EditToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<EditToolName>,
  ) => Promise<CodebuffToolOutput<EditToolName>>
}) => {
  await previousToolCallFinished
  return {
    output: await requestClientToolCall({
      toolName: 'edit_3d_asset',
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
    }),
  }
}) satisfies CodebuffToolHandlerFunction<EditToolName>
