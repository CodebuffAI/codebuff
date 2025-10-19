import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { getFileProcessingValues, postStreamProcessing } from './write-file'

import type {
  FileProcessingState,
  OptionalFileProcessingState,
} from './write-file'
import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleCreatePlan = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'create_plan'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>,
  ) => Promise<CodebuffToolOutput<'create_plan'>>
  writeToClient: (chunk: string) => void
  logger: Logger

  getLatestState: () => FileProcessingState
  state: {
    agentStepId?: string
    clientSessionId?: string
    fingerprintId?: string
    userId?: string
    userInputId?: string
    repoId?: string
  } & OptionalFileProcessingState
}): {
  result: Promise<CodebuffToolOutput<'create_plan'>>
  state: FileProcessingState
} => {
  const {
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    writeToClient,
    logger,
    getLatestState,
    state,
  } = params
  const { path, plan } = toolCall.input
  const {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userId,
    userInputId,
    repoId,
  } = state
  const fileProcessingState = getFileProcessingValues(state)

  logger.debug(
    {
      path,
      plan,
    },
    'Create plan',
  )
  // Add the plan file to the processing queue
  if (!fileProcessingState.promisesByPath[path]) {
    fileProcessingState.promisesByPath[path] = []
    if (path.endsWith('knowledge.md')) {
      trackEvent({
        event: AnalyticsEvent.KNOWLEDGE_FILE_UPDATED,
        userId: userId ?? '',
        properties: {
          agentStepId,
          clientSessionId,
          fingerprintId,
          userInputId,
          userId,
          repoName: repoId,
        },
        logger,
      })
    }
  }
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
        getLatestState(),
        writeToClient,
        requestClientToolCall,
      )
    })(),
    state: fileProcessingState,
  }
}) satisfies CodebuffToolHandlerFunction<'create_plan'>
