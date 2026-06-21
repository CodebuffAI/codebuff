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
  const { path, replacements, atomic } = toolCall.input

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

  if (
    fileProcessingState.strictReadBeforeEdit &&
    !hasReadCapability &&
    !fileProcessingState.readAuthorizationsByPath?.[path]
  ) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: [
              `Edit blocked: strict read-before-edit is enabled and no read authorization exists for ${path} in this turn.`,
              `Recovery required: call read_files for ${path} (the exact target file and line range) before retrying str_replace, or include a basedOnRead capability on at least one replacement.`,
            ].join('\n'),
          },
        },
      ],
    }
  }

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
    atomic,
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
    // Strict read-before-edit: a successful edit consumes the per-path read
    // authorization so a second edit on the same path must either re-read or
    // anchor itself with a fresh basedOnRead capability.
    if (
      fileProcessingState.strictReadBeforeEdit &&
      fileProcessingState.readAuthorizationsByPath
    ) {
      delete fileProcessingState.readAuthorizationsByPath[path]
    }
  }

  const clientToolResult = await postStreamProcessing<'str_replace'>(
    strReplaceResult,
    fileProcessingState,
    writeToClient,
    requestClientToolCall,
  )

  const firstResult = clientToolResult[0]
  if (!firstResult) {
    logger.warn(
      { path, toolCallId: toolCall.toolCallId, strReplaceResult },
      'str_replace client returned an empty tool result; synthesizing a successful patch response',
    )
    const patch = 'patch' in strReplaceResult ? strReplaceResult.patch : ''
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            ...(patch ? { unifiedDiff: patch, patch } : {}),
            message: [
              ...('messages' in strReplaceResult ? strReplaceResult.messages : []),
              'Applied str_replace patch; synthesized result because the client returned an empty response.',
            ].join('\n\n'),
          },
        },
      ],
    }
  }

  if (
    firstResult.type === 'json' &&
    firstResult.value &&
    typeof firstResult.value === 'object' &&
    'messages' in strReplaceResult &&
    'message' in firstResult.value
  ) {
    firstResult.value.message = [
      ...strReplaceResult.messages,
      firstResult.value.message,
    ].join('\n\n')
  }

  return { output: clientToolResult }
}) satisfies CodebuffToolHandlerFunction<'str_replace'>
