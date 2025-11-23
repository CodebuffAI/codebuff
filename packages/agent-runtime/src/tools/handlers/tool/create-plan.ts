import { postStreamProcessing } from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleCreatePlan = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'create_plan'>

  fileProcessingState: FileProcessingState
  logger: Logger

  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>,
  ) => Promise<CodebuffToolOutput<'create_plan'>>
  writeToClient: (chunk: string) => void
}): {
  result: Promise<CodebuffToolOutput<'create_plan'>>
  state: {}
} => {
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

  return {
    result: (async () => {
      await previousToolCallFinished
      return await postStreamProcessing<'create_plan'>(
        change,
        fileProcessingState,
        writeToClient,
        requestClientToolCall,
      )
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'create_plan'>
