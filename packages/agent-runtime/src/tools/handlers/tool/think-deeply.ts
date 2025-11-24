import { validateToolHandler } from '../handler-function-type'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

type ToolName = 'think_deeply'
export const handleThinkDeeply = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<any>
    toolCall: CodebuffToolCall<ToolName>
    logger: Logger
  }): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
    const { previousToolCallFinished, toolCall, logger } = params
    const { thought } = toolCall.input

    logger.debug(
      {
        thought,
      },
      'Thought deeply',
    )

    await previousToolCallFinished
    return { output: [] }
  },
)
