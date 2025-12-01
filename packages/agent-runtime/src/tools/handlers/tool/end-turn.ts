import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleEndTurn = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'end_turn'>
}): Promise<{ output: CodebuffToolOutput<'end_turn'> }> => {
  const { previousToolCallFinished } = params

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Turn ended.' } }] }
}) satisfies CodebuffToolHandlerFunction<'end_turn'>
