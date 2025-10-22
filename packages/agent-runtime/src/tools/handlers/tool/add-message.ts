import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

export const handleAddMessage = (({
  previousToolCallFinished,
  toolCall,
  getLatestState,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'add_message'>
  getLatestState: () => { messages: Message[] }
}): {
  result: Promise<CodebuffToolOutput<'add_message'>>
  state: {}
} => {
  return {
    result: (async () => {
      await previousToolCallFinished

      getLatestState().messages.push(toolCall.input)
      return []
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'add_message'>
