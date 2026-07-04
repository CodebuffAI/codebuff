import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'

export const handleEndTurn = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebirdsToolCall<'end_turn'>
}): Promise<{ output: CodebirdsToolOutput<'end_turn'> }> => {
  const { previousToolCallFinished } = params

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Turn ended.' } }] }
}) satisfies CodebirdsToolHandlerFunction<'end_turn'>
