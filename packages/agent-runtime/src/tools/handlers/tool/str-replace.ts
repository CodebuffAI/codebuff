import { postStreamProcessing } from './write-file'
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

export const handleStrReplace = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'str_replace'>

    fileProcessingState: FileProcessingState
    logger: Logger

    requestClientToolCall: (
      toolCall: ClientToolCall<'str_replace'>,
    ) => Promise<CodebuffToolOutput<'str_replace'>>
    writeToClient: (chunk: string) => void

    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<'str_replace'> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    fileProcessingState,
    logger,

    requestClientToolCall,
    requestOptionalFile,
    writeToClient,
  } = params
  const { path, replacements } = toolCall.input

  await previousToolCallFinished

  if (fileProcessingState.failedEditRequiresReadByPath[path]) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: [
              'Edit blocked: a previous str_replace failed for this file.',
              'Recovery required: re-read the exact current lines with read_files before attempting another str_replace on this path.',
            ].join('\n'),
          },
        },
      ],
    }
  }

  const hasReadCapability = replacements.some((replacement) =>
    Boolean(replacement.basedOnRead),
  )

  if (!fileProcessingState.promisesByPath[path] || hasReadCapability) {
    fileProcessingState.promisesByPath[path] = []
  }

  const previousPromises = fileProcessingState.promisesByPath[path]
  const previousEdit = previousPromises[previousPromises.length - 1]

  // A basedOnRead anchor is minted from a fresh read_files disk read and must be
  // validated against that same current disk content. Do not chain from an older
  // in-memory edit promise here: a previous failed/partial edit can carry stale
  // content with a different line count, causing fresh anchors to be rejected.
  const latestContentPromise = hasReadCapability
    ? requestOptionalFile({ ...params, filePath: path })
    : previousEdit
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

  const strReplaceResult = await newPromise
  if ('error' in strReplaceResult) {
    fileProcessingState.failedEditRequiresReadByPath[path] = true
  } else {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
  }

  const clientToolResult = await postStreamProcessing<'str_replace'>(
    strReplaceResult,
    fileProcessingState,
    writeToClient,
    requestClientToolCall,
  )

  const value = clientToolResult[0].value
  if ('messages' in strReplaceResult && 'message' in value) {
    value.message = [...strReplaceResult.messages, value.message].join('\n\n')
  }

  return { output: clientToolResult }
}) satisfies CodebuffToolHandlerFunction<'str_replace'>
