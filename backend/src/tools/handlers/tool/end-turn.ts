import type { CodebuffToolCall } from '../../constants'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleEndTurn = ((params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'end_turn'>
}): { result: Promise<string>; state: {} } => {
  return { result: params.previousToolCallFinished.then(() => ''), state: {} }
}) satisfies CodebuffToolHandlerFunction<'end_turn'>
