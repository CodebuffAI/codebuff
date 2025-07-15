import { CodebuffMessage } from '@codebuff/common/types/message'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { WebSocket } from 'ws'
import { getFileReadingUpdates } from '../../get-file-reading-updates'
import { logger } from '../../util/logger'
import { renderReadFilesResult } from '../../util/parse-tool-call-xml'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleReadFiles = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'read_files'>
  fileContext: ProjectFileContext
  state: {
    ws?: WebSocket
    userId?: string
    agentStepId?: string
    clientSessionId?: string
    fingerprintId?: string
    userInputId?: string
    repoId?: string
    mutableState?: {
      messages: CodebuffMessage[]
    }
  }
}): {
  result: Promise<string>
  state: {}
} => {
  const { previousToolCallFinished, toolCall, fileContext, state } = params
  const {
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
    mutableState,
  } = state
  const { paths } = toolCall.args
  if (!ws) {
    throw new Error('Internal error for read_files: Missing WebSocket in state')
  }
  if (!mutableState?.messages) {
    throw new Error('Internal error for read_files: Missing messages in state')
  }
  if (!agentStepId) {
    throw new Error(
      'Internal error for read_files: Missing agentStepId in state'
    )
  }
  if (!clientSessionId) {
    throw new Error(
      'Internal error for read_files: Missing clientSessionId in state'
    )
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for read_files: Missing fingerprintId in state'
    )
  }
  if (!userInputId) {
    throw new Error(
      'Internal error for read_files: Missing userInputId in state'
    )
  }

  const readFilesResultsPromise = (async () => {
    const { addedFiles, updatedFilePaths } = await getFileReadingUpdates(
      ws,
      mutableState.messages,
      fileContext,
      {
        requestedFiles: paths,
        agentStepId,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        repoId,
      }
    )

    logger.debug(
      {
        content: paths,
        paths,
        addedFilesPaths: addedFiles.map((f) => f.path),
        updatedFilePaths,
      },
      'read_files tool call'
    )

    return renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {})
  })()

  return {
    result: (async () => {
      await previousToolCallFinished
      return await readFilesResultsPromise
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'read_files'>
