import { logger } from '../../../util/logger'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'

export const handleThinkDeeply = ((params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'think_deeply'>
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall } = params
  const { thought } = toolCall.input

  logger.debug(
    {
      thought,
    },
    'Thought deeply',
  )

  return {
    result: previousToolCallFinished.then(() => 'Deep thinking completed.'),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'think_deeply'>
