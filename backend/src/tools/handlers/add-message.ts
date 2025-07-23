import { CodebuffMessage } from '@codebuff/common/types/message'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleAddMessage = (({
  previousToolCallFinished,
  toolCall,
  getLatestState,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'add_message'>
  getLatestState: () => { messages: CodebuffMessage[] }
}): {
  result: Promise<undefined>
  state: {}
} => {
  return {
    result: previousToolCallFinished.then(() => {
      getLatestState().messages.push(toolCall.args)
      return undefined
    }),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'add_message'>
