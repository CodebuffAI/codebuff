import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleRenderUI = (async ({
  previousToolCallFinished,
}: {
  previousToolCallFinished: Promise<unknown>
  toolCall: CodebuffToolCall<'render_ui'>
}): Promise<{ output: CodebuffToolOutput<'render_ui'> }> => {
  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'UI rendered.' } }] }
}) satisfies CodebuffToolHandlerFunction<'render_ui'>
