import { logger } from '../../../util/logger'

import type { CodebuffToolCall } from '../../constants'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'

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
