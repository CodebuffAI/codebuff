import { CodebuffMessage } from '@codebuff/common/types/message'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleSetMessages = (({
  previousToolCallFinished,
  toolCall,
  getLatestState,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'set_messages'>
  getLatestState: () => { messages: CodebuffMessage[] }
}): {
  result: Promise<undefined>
  state: {}
} => {
  return {
    result: previousToolCallFinished.then(() => {
      getLatestState().messages = toolCall.args.messages
      return undefined
    }),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'set_messages'>
