import { normalizeToolPath, postStreamProcessing } from './write-file'
import { processStrReplace } from '../../../process-str-replace'
import {
  preflightValidateSyntax,
  formatPreflightErrorMessage,
} from '../../../util/preflight-syntax-validation'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessing, FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

// Fix C: after this many consecutive str_replace attempts on the same path
// that returned an error or an auto-corrected near-match, hard-block further
// str_replace calls on that path and direct the agent to a whole-symbol or
// whole-file edit instead. Stops the retry-cascade corruption seen when the
// agent keeps retrying a stale oldString.
const STR_REPLACE_MAX_CONSECUTIVE_FAILURES = 3

const NEAR_MATCH_AUTOCORRECT_MARKER = 'auto-corrected a near-match edit'

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
  const path = normalizeToolPath(toolCall.input.path)
  const { replacements, atomic } = toolCall.input

  if (!path) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: toolCall.input.path,
            errorMessage: `str_replace path traversal blocked: "${toolCall.input.path}" resolves outside the project root.`,
          },
        },
      ],
    }
  }

  await previousToolCallFinished

  const hasReadCapability = replacements.some((replacement) =>
    Boolean(replacement.basedOnRead),
  )

  // A fresh basedOnRead anchor proves the agent has just seen the current
  // disk content, so it clears the stale failedEditRequiresReadByPath flag
  // (unblocking the next edit). It does NOT reset the consecutive-failure
  // counter: a re-read-and-retry loop that keeps failing on the same path is
  // exactly the retry spiral the circuit breaker exists to stop. The counter
  // only clears on a genuine clean success below.
  if (hasReadCapability) {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
  }

  // Fix C: per-path consecutive-failure circuit breaker. If the agent has
  // already had several consecutive failed/auto-corrected str_replace attempts
  // on this path, refuse the next attempt and direct the agent to a
  // whole-symbol or whole-file edit instead of allowing another retry spiral.
  const consecutiveFailures =
    fileProcessingState.consecutiveStrReplaceFailuresByPath[path] ?? 0
  if (consecutiveFailures >= STR_REPLACE_MAX_CONSECUTIVE_FAILURES) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: [
              `str_replace circuit breaker: ${consecutiveFailures} consecutive failed or auto-corrected attempts on \`${path}\` in this turn.`,
              'Continuing to retry str_replace on this path is likely to corrupt the file.',
              'Next: switch to a whole-symbol or whole-file edit instead — use rewrite_symbol for an entire function/method/type, or write_file to reconstruct the whole file. If you must use str_replace, first re-read the exact current lines with read_files and copy oldString verbatim from that fresh output.',
            ].join('\n'),
          },
        },
      ],
    }
  }

  if (fileProcessingState.failedEditRequiresReadByPath[path]) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: [
              'Edit blocked: a previous str_replace failed for this file.',
              'Next: re-read the exact current lines with read_files before attempting another str_replace on this path, or supply a fresh basedOnRead capability.',
            ].join('\n'),
          },
        },
      ],
    }
  }

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
              `Edit blocked: strict read-before-edit is enabled and no read authorization exists for ${path}.`,
              `Next: call read_files for ${path} (the exact target file and line range) before retrying str_replace, or include a basedOnRead capability on at least one replacement.`,
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

  const newPromise: Promise<FileProcessing<'str_replace'>> = processStrReplace({
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
        preflightSyntaxError: false,
      }
    })
    .then((fileProcessingResult) => {
      const result = {
        ...fileProcessingResult,
        toolCallId: toolCall.toolCallId,
      }
      if (!('error' in fileProcessingResult)) {
        const syntaxValidation = preflightValidateSyntax(
          path,
          fileProcessingResult.content,
        )
        if (!syntaxValidation.valid) {
          return {
            tool: 'str_replace' as const,
            path,
            toolCallId: toolCall.toolCallId,
            error: formatPreflightErrorMessage(
              'str_replace',
              path,
              syntaxValidation.message,
            ),
            preflightSyntaxError: true,
          }
        }
      }
      return result
    })

  fileProcessingState.promisesByPath[path].push(newPromise)
  fileProcessingState.allPromises.push(newPromise)

  const strReplaceResult = await newPromise
  if ('error' in strReplaceResult) {
    // A preflight syntax failure is semantically different from a stale-anchor
    // failure: the agent's oldString was fine, the new content just had a
    // syntax error. Don't penalize the circuit breaker or force a re-read —
    // the agent only needs to fix the syntax, not re-read the file or switch
    // tools. (Fix C circuit breaker only counts real processing failures.)
    if (!strReplaceResult.preflightSyntaxError) {
      fileProcessingState.failedEditRequiresReadByPath[path] = true
      // Fix C: a hard error counts as a consecutive failure.
      fileProcessingState.consecutiveStrReplaceFailuresByPath[path] =
        (fileProcessingState.consecutiveStrReplaceFailuresByPath[path] ?? 0) + 1
    }
  } else {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
    // Fix C: an auto-corrected near-match is a weak/suspect outcome and also
    // counts toward the circuit breaker. A clean, exact-match success clears
    // the counter so the agent can recover on the same path.
    const hadAutoCorrect = strReplaceResult.messages.some((msg) =>
      msg.includes(NEAR_MATCH_AUTOCORRECT_MARKER),
    )
    if (hadAutoCorrect) {
      fileProcessingState.consecutiveStrReplaceFailuresByPath[path] =
        (fileProcessingState.consecutiveStrReplaceFailuresByPath[path] ?? 0) + 1
    } else {
      delete fileProcessingState.consecutiveStrReplaceFailuresByPath[path]
    }
    // Strict read-before-edit: read authorization is sticky once granted by
    // read_files or write_file. Successful edits on the same path remain
    // authorized for subsequent edits; only a failed edit (which sets
    // failedEditRequiresReadByPath) or an externally-changed file (anchored
    // with a fresh basedOnRead capability) re-enables the strict gate.
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
