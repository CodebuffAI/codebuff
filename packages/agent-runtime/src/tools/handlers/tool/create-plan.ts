import { postStreamProcessing } from './write-file'
import { validateToolHandler } from '../handler-function-type'

import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

type ToolName = 'create_plan'
export const handleCreatePlan = validateToolHandler<ToolName>(
  async (params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    fileProcessingState: FileProcessingState
    logger: Logger

    requestClientToolCall: (
      toolCall: ClientToolCall<ToolName>,
    ) => Promise<CodebuffToolOutput<ToolName>>
    writeToClient: (chunk: string) => void
  }): Promise<{
    output: CodebuffToolOutput<ToolName>
  }> => {
    const {
      fileProcessingState,
      logger,
      previousToolCallFinished,
      toolCall,
      requestClientToolCall,
      writeToClient,
    } = params
    const { path, plan } = toolCall.input

    logger.debug(
      {
        path,
        plan,
      },
      'Create plan',
    )
    // Add the plan file to the processing queue
    const change = {
      tool: 'create_plan' as const,
      path,
      content: plan,
      messages: [],
      toolCallId: toolCall.toolCallId,
    }
    fileProcessingState.promisesByPath[path].push(Promise.resolve(change))
    fileProcessingState.allPromises.push(Promise.resolve(change))

    await previousToolCallFinished
    return {
      output: await postStreamProcessing<'create_plan'>(
        change,
        fileProcessingState,
        writeToClient,
        requestClientToolCall,
      ),
    }
  },
)
