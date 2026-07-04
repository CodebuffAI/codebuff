import type { CodebirdsToolHandlerFunction } from '../handler-function-type'
import type {
  CodebirdsToolCall,
  CodebirdsToolOutput,
} from '@codebirds/common/tools/list'
import type { Logger } from '@codebirds/common/types/contracts/logger'

export const handleThinkDeeply = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: CodebirdsToolCall<'think_deeply'>
  logger: Logger
}): Promise<{ output: CodebirdsToolOutput<'think_deeply'> }> => {
  const { previousToolCallFinished, toolCall, logger } = params
  const { thought } = toolCall.input

  logger.debug(
    {
      thought,
    },
    'Thought deeply',
  )

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Thought logged.' } }] }
}) satisfies CodebirdsToolHandlerFunction<'think_deeply'>
