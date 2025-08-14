import { getFileProcessingValues, postStreamProcessing } from './write-file'
import { processStrReplace } from '../../../process-str-replace'
import { logger } from '../../../util/logger'
import { requestOptionalFile } from '../../../websockets/websocket-action'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  FileProcessingState,
  OptionalFileProcessingState,
} from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
} from '@codebuff/common/tools/list'
import type { WebSocket } from 'ws'

export const handleStrReplace = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'str_replace'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'str_replace'>,
  ) => Promise<string>
  writeToClient: (chunk: string) => void

  getLatestState: () => FileProcessingState
  state: {
    ws?: WebSocket
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
  const { path, replacements } = toolCall.input
  const { ws } = state
  if (ws === undefined) {
    throw new Error(
      'Internal error for str_replace: Missing WebSocket in state',
    )
  }
  const fileProcessingState = getFileProcessingValues(state)

  if (!fileProcessingState.promisesByPath[path]) {
    fileProcessingState.promisesByPath[path] = []
  }

  const latestContentPromise = Promise.all(
    fileProcessingState.promisesByPath[path],
  ).then((results) => {
    const previousEdit = results.findLast((r) => 'content' in r)
    return previousEdit ? previousEdit.content : requestOptionalFile(ws, path)
  })

  const newPromise = processStrReplace(path, replacements, latestContentPromise)
    .catch((error: any) => {
      logger.error(error, 'Error processing str_replace block')
      return {
        tool: 'str_replace' as const,
        path,
        error: 'Unknown error: Failed to process the str_replace block.',
      }
    })
    .then((fileProcessingResult) => ({
      ...fileProcessingResult,
      toolCallId: toolCall.toolCallId,
    }))

  fileProcessingState.promisesByPath[path].push(newPromise)
  fileProcessingState.allPromises.push(newPromise)

  return {
    result: previousToolCallFinished.then(async () => {
      return await postStreamProcessing<'str_replace'>(
        await newPromise,
        getLatestState(),
        writeToClient,
        requestClientToolCall,
      )
    }),
    state: fileProcessingState,
  }
}) satisfies CodebuffToolHandlerFunction<'str_replace'>
