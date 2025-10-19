import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

export const handleSetMessages = (({
  previousToolCallFinished,
  toolCall,
  getLatestState,
}: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'set_messages'>
  getLatestState: () => { messages: Message[] }
}): {
  result: Promise<CodebuffToolOutput<'set_messages'>>
  state: {}
} => {
  return {
    result: (async () => {
      await previousToolCallFinished
      getLatestState().messages = toolCall.input.messages
      return []
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'set_messages'>
