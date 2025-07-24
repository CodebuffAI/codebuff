import type { ClientToolCall, CodebuffToolCall } from '../../constants'
import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  FileProcessingState,
  OptionalFileProcessingState,
} from './write-file'

import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { logger } from '../../../util/logger'
import { getFileProcessingValues, postStreamProcessing } from './write-file'

export const handleCreatePlan = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'create_plan'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>
  ) => Promise<string>
  writeToClient: (chunk: string) => void

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
  result: Promise<string>
  state: FileProcessingState
} => {
  const {
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    writeToClient,
    getLatestState,
    state,
  } = params
  const { path, plan } = toolCall.args
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
    'Create plan'
  )
  // Add the plan file to the processing queue
  if (!fileProcessingState.promisesByPath[path]) {
    fileProcessingState.promisesByPath[path] = []
    if (path.endsWith('knowledge.md')) {
      trackEvent(AnalyticsEvent.KNOWLEDGE_FILE_UPDATED, userId ?? '', {
        agentStepId,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        repoName: repoId,
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
    result: previousToolCallFinished.then(async () => {
      return await postStreamProcessing<'create_plan'>(
        change,
        getLatestState(),
        writeToClient,
        requestClientToolCall
      )
    }),
    state: fileProcessingState,
  }
}) satisfies CodebuffToolHandlerFunction<'create_plan'>
