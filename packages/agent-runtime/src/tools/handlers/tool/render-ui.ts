import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'

export const handleRenderUI = (async ({
  previousToolCallFinished,
}: {
  previousToolCallFinished: Promise<unknown>
  toolCall: CodebirdsToolCall<'render_ui'>
}): Promise<{ output: CodebirdsToolOutput<'render_ui'> }> => {
  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'UI rendered.' } }] }
}) satisfies CodebirdsToolHandlerFunction<'render_ui'>
