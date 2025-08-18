import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { CodebuffMessage } from '@codebuff/common/types/message'

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
      getLatestState().messages.push(toolCall.input)
      return undefined
    }),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'add_message'>
