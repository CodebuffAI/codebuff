import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { partition } from 'lodash'
import { logger } from '../../util/logger'
import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'
import { FileProcessingMutableState } from './write-file'

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

  const postStreamProcessing = async () => {
    const allFileProcessingResults = await Promise.all(mutableState.allPromises)
    if (!mutableState.firstFileProcessed) {
      ;[mutableState.fileChangeErrors, mutableState.fileChanges] = partition(
        allFileProcessingResults,
        (result) => 'error' in result
      )
      if (
        mutableState.fileChanges.length === 0 &&
        allFileProcessingResults.length > 0
      ) {
        writeToClient('No changes to existing files.\n')
      }
      if (mutableState.fileChanges.length > 0) {
        writeToClient(`\n`)
      }
      mutableState.firstFileProcessed = true
    }

    const toolCallResults: string[] = []

    const errors = mutableState.fileChangeErrors.filter(
      (result) => result.toolCallId === toolCall.toolCallId
    )
    toolCallResults.push(
      ...errors.map(({ path, error }) => `Error processing ${path}: ${error}`)
    )

    const changes = mutableState.fileChanges.filter(
      (result) => result.toolCallId === toolCall.toolCallId
    )
    for (const { path, content, patch, tool } of changes) {
      const clientResult = await requestClientToolCall({
        toolName: 'create_plan',
        toolCallId: toolCall.toolCallId,
        args: patch
          ? {
              type: 'patch' as const,
              path,
              content: patch,
            }
          : {
              type: 'file' as const,
              path,
              content,
            },
      })

      toolCallResults.push(clientResult)
    }

    return toolCallResults.join('\n\n')
  }

  return {
    result: previousToolCallFinished.then(postStreamProcessing),
    state: { mutableState },
  }
}) satisfies CodebuffToolHandlerFunction<'create_plan'>
