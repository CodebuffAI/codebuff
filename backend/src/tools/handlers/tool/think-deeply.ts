import { logger } from '../../../util/logger'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

export const handleThinkDeeply = ((params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'think_deeply'>
}): { result: Promise<CodebuffToolOutput<'think_deeply'>>; state: {} } => {
  const { previousToolCallFinished, toolCall } = params
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
