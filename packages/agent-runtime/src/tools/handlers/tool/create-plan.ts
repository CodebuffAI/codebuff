import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { getFileProcessingValues, postStreamProcessing } from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const handleCreatePlan = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'create_plan'>

  agentStepId: string
  clientSessionId: string
  fingerprintId: string
  logger: Logger
  repoId: string | undefined
  userId: string | undefined
  userInputId: string
  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>,
  ) => Promise<CodebuffToolOutput<'create_plan'>>
  trackEvent: TrackEventFn
  writeToClient: (chunk: string) => void

  getLatestState: () => FileProcessingState
  state: FileProcessingState
}): {
  result: Promise<CodebuffToolOutput<'create_plan'>>
  state: FileProcessingState
} => {
  const {
    agentStepId,
    clientSessionId,
    fingerprintId,
    logger,
    previousToolCallFinished,
    repoId,
    state,
    toolCall,
    userId,
    userInputId,
    getLatestState,
    requestClientToolCall,
    trackEvent,
    writeToClient,
  } = params
  const { path, plan } = toolCall.input
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
