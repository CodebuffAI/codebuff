import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { logger } from '../../util/logger'
import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'
import { FileProcessingMutableState, postStreamProcessing } from './write-file'

export const handleCreatePlan = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'create_plan'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>
  ) => Promise<string>
  writeToClient: (chunk: string) => void

  state: {
    agentStepId?: string
    clientSessionId?: string
    fingerprintId?: string
    userId?: string
    userInputId?: string
    repoId?: string
    mutableState?: FileProcessingMutableState
  }
}): {
  result: Promise<string>
  state: { mutableState: FileProcessingMutableState }
} => {
  const {
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    writeToClient,
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
  const mutableState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    ...state.mutableState,
  }

  logger.debug(
    {
      path,
      plan,
    },
    'Create plan'
  )
  // Add the plan file to the processing queue
  if (!mutableState.promisesByPath[path]) {
    mutableState.promisesByPath[path] = []
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
  mutableState.promisesByPath[path].push(Promise.resolve(change))
  mutableState.allPromises.push(Promise.resolve(change))

  return {
    result: previousToolCallFinished.then(async () => {
      return await postStreamProcessing<'create_plan'>(
        change,
        mutableState,
        writeToClient,
        requestClientToolCall
      )
    }),
    state: { mutableState },
  }
}) satisfies CodebuffToolHandlerFunction<'create_plan'>
