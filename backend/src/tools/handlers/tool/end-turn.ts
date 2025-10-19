import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleEndTurn = (({
  previousToolCallFinished,
}: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'end_turn'>
}): { result: Promise<CodebuffToolOutput<'end_turn'>>; state: {} } => {
  return {
    result: (async () => {
      await previousToolCallFinished
      return []
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'end_turn'>
