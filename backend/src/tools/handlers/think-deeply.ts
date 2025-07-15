import { logger } from '../../util/logger'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleThinkDeeply = ((params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebuffToolCall<'think_deeply'>
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall } = params
  const { thought } = toolCall.args

  logger.debug(
    {
      thought,
    },
    'Thought deeply'
  )

  return { result: previousToolCallFinished.then(() => ''), state: {} }
}) satisfies CodebuffToolHandlerFunction<'think_deeply'>
