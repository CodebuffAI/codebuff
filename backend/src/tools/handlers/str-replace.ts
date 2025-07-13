import { WebSocket } from 'ws'
import { processStrReplace } from '../../process-str-replace'
import { logger } from '../../util/logger'
import { requestOptionalFile } from '../../features/websockets/websocket-action'
import {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolHandlerFunction,
} from '../constants'
import { FileProcessingMutableState, postStreamProcessing } from './write-file'

export const handleStrReplace = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'str_replace'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'str_replace'>
  ) => Promise<string>
  writeToClient: (chunk: string) => void

  state: {
    ws?: WebSocket
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
  const { path, replacements } = toolCall.args
  const { ws } = state
  if (ws === undefined) {
    throw new Error(
      'Internal error for str_replace: Missing WebSocket in state'
    )
  }
  const mutableState = {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    ...state.mutableState,
  }

  if (!mutableState.promisesByPath[path]) {
    mutableState.promisesByPath[path] = []
  }

  const latestContentPromise = Promise.all(
    mutableState.promisesByPath[path]
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

  mutableState.promisesByPath[path].push(newPromise)
  mutableState.allPromises.push(newPromise)

  return {
    result: previousToolCallFinished.then(async () => {
      return await postStreamProcessing(
        toolCall,
        mutableState,
        writeToClient,
        requestClientToolCall
      )
    }),
    state: { mutableState },
  }
}) satisfies CodebuffToolHandlerFunction<'str_replace'>
