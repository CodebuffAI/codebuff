import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleThinkDeeply = ((params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'think_deeply'>
  logger: Logger
}): { result: Promise<CodebuffToolOutput<'think_deeply'>>; state: {} } => {
  const { previousToolCallFinished, toolCall, logger } = params
  const { thought } = toolCall.input

  logger.debug(
    {
      thought,
    },
    'Thought deeply',
  )

  return {
    result: previousToolCallFinished.then(() => []),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'think_deeply'>
