import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleEndTurn = (async (params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'end_turn'>
}): Promise<{ result: ''; state: {} }> => {
  await params.previousToolCallResult
  return { result: '', state: {} }
}) satisfies CodebuffToolHandlerFunction<'end_turn'>
