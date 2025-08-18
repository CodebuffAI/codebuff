import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { CodebuffMessage } from '@codebuff/common/types/message'

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
      getLatestState().messages = toolCall.input.messages
      return undefined
    }),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'set_messages'>
