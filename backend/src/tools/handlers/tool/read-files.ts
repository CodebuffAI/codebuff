import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { logger } from '../../../util/logger'
import { renderReadFilesResult } from '../../../util/parse-tool-call-xml'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { CodebuffMessage } from '@codebuff/common/types/message'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

export const handleReadFiles = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'read_files'>

  agentStepId: string
  clientSessionId: string
  userInputId: string
  fileContext: ProjectFileContext

  state: {
    ws?: WebSocket
    userId?: string
    fingerprintId?: string
    repoId?: string
    messages?: CodebuffMessage[]
  }
}): {
  result: Promise<string>
  state: {}
} => {
  const {
    previousToolCallFinished,
    toolCall,
    agentStepId,
    clientSessionId,
    userInputId,
    fileContext,
    state,
  } = params
  const { ws, fingerprintId, userId, repoId, messages } = state
  const { paths } = toolCall.input
  if (!ws) {
    throw new Error('Internal error for read_files: Missing WebSocket in state')
  }
  if (!messages) {
    throw new Error('Internal error for read_files: Missing messages in state')
  }
  if (!fingerprintId) {
    throw new Error(
      'Internal error for read_files: Missing fingerprintId in state',
    )
  }
  if (!userInputId) {
    throw new Error(
      'Internal error for read_files: Missing userInputId in state',
    )
  }

  const readFilesResultsPromise = (async () => {
    const { addedFiles, updatedFilePaths } = await getFileReadingUpdates(
      ws,
      messages,
      fileContext,
      {
        requestedFiles: paths,
        agentStepId,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        repoId,
      },
    )

    logger.debug(
      {
        content: paths,
        paths,
        addedFilesPaths: addedFiles.map((f) => f.path),
        updatedFilePaths,
      },
      'read_files tool call',
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
