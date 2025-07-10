import { CodebuffToolCall } from '../constants'

export async function handleEndTurn(params: {
  previousToolCallResult: Promise<any>
  toolCall: CodebuffToolCall<'end_turn'>
}): Promise<string> {
  await params.previousToolCallResult
  return ''
}
