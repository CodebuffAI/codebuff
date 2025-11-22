import { getFileProcessingValues, postStreamProcessing } from './write-file'
import { processStrReplace } from '../../../process-str-replace'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

export function handleStrReplace(
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'str_replace'>
    requestClientToolCall: (
      toolCall: ClientToolCall<'str_replace'>,
    ) => Promise<CodebuffToolOutput<'str_replace'>>
    writeToClient: (chunk: string) => void
    logger: Logger

    getLatestState: () => FileProcessingState
    state: FileProcessingState
    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): {
  result: Promise<CodebuffToolOutput<'str_replace'>>
  state: FileProcessingState
} {
  const {
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    writeToClient,
    logger,
    getLatestState,
    requestOptionalFile,
    state,
  } = params
  const { path, replacements } = toolCall.input
  const fileProcessingState = getFileProcessingValues(state)

  if (!fileProcessingState.promisesByPath[path]) {
    fileProcessingState.promisesByPath[path] = []
  }

  const previousPromises = fileProcessingState.promisesByPath[path]
  const previousEdit = previousPromises[previousPromises.length - 1]

  const latestContentPromise = previousEdit
    ? previousEdit.then((maybeResult) =>
        maybeResult && 'content' in maybeResult
          ? maybeResult.content
          : requestOptionalFile({ ...params, filePath: path }),
      )
    : requestOptionalFile({ ...params, filePath: path })

  const newPromise = processStrReplace({
    path,
    replacements,
    initialContentPromise: latestContentPromise,
    logger,
  })
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
    result: (async () => {
      await previousToolCallFinished

      const strReplaceResult = await newPromise
      const clientToolResult = await postStreamProcessing<'str_replace'>(
        strReplaceResult,
        getLatestState(),
        writeToClient,
        requestClientToolCall,
      )

      const value = clientToolResult[0].value
      if ('messages' in strReplaceResult && 'message' in value) {
        value.message = [...strReplaceResult.messages, value.message].join(
          '\n\n',
        )
      }

      return clientToolResult
    })(),
    state: fileProcessingState,
  }
}
handleStrReplace satisfies CodebuffToolHandlerFunction<'str_replace'>
