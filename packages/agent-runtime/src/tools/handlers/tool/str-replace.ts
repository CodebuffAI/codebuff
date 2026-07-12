import {
  formatUnsafeToolPathError,
  isWholeFileReadAuthorizationFresh,
  normalizeToolPath,
  postStreamProcessing,
  revokeWholeFileReadAuthorization,
} from './write-file'
import { coordinateEditApplication } from './edit-application-coordinator'
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

// Fix C: after this many str_replace attempts on the same path in one turn
// return an error or an auto-corrected near-match, hard-block further
// str_replace calls on that path and direct the agent to a whole-symbol or
// whole-file edit instead. Successful edits deliberately do not erase this
// failure budget: alternating failure/success cascades are the common way a
// stale multi-replacement batch evades a purely consecutive-failure counter.
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
    structuralRecovery?: boolean

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
    structuralRecovery = false,
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
            errorMessage: formatUnsafeToolPathError(
              'str_replace',
              toolCall.input.path,
            ),
          },
        },
      ],
    }
  }

  await previousToolCallFinished

  const hasAnyReadCapability = replacements.some((replacement) =>
    Boolean(replacement.basedOnRead),
  )
  const recoveringFromFailedEdit = Boolean(
    fileProcessingState.failedEditRequiresReadByPath[path],
  )

  // Fix C: per-path failure-budget circuit breaker. If the agent has already
  // had several failed/auto-corrected str_replace attempts on this path, refuse
  // the next attempt and direct the agent to a
  // whole-symbol or whole-file edit instead of allowing another retry spiral.
  const consecutiveFailures =
    fileProcessingState.consecutiveStrReplaceFailuresByPath[path] ?? 0
  if (
    !structuralRecovery &&
    consecutiveFailures >= STR_REPLACE_MAX_CONSECUTIVE_FAILURES
  ) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: [
              `str_replace circuit breaker: ${consecutiveFailures} failed or auto-corrected attempts on \`${path}\` in this turn.`,
              'Continuing to retry str_replace on this path is likely to corrupt the file.',
              'Next: use rewrite_symbol for an entire function/method/type, replace_range with a fresh expectedHash for a known block, or write_file to reconstruct the whole file. Raw str_replace remains blocked for this path until the next turn.',
            ].join('\n'),
          },
        },
      ],
    }
  }

  if (
    recoveringFromFailedEdit &&
    !hasAnyReadCapability &&
    !structuralRecovery
  ) {
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

  const hasStoredWholeFileAuthorization = Boolean(
    fileProcessingState.readAuthorizationsByPath?.[path] ||
    fileProcessingState.readAuthorizationHashesByPath?.[path],
  )
  if (
    fileProcessingState.strictReadBeforeEdit &&
    !hasStoredWholeFileAuthorization &&
    !hasAnyReadCapability
  ) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: [
              `Edit blocked: strict read-before-edit is enabled and no fresh read authorization exists for ${path}.`,
              `Next: call read_files with paths: ["${path}"] for whole-file authorization, or include a matching fresh basedOnRead capability on every replacement.`,
            ].join('\n'),
          },
        },
      ],
    }
  }

  if (!fileProcessingState.promisesByPath[path]) {
    fileProcessingState.promisesByPath[path] = []
  }

  const previousPromises = fileProcessingState.promisesByPath[path]
  const previousEdit = previousPromises[previousPromises.length - 1]

  // Same-turn committed edits are the current base even when the client's
  // filesystem stub does not immediately reflect them. Across turns there is
  // no prior promise, so the disk read below is the external-change boundary.
  const latestContent = hasAnyReadCapability
    ? await requestOptionalFile({ ...params, filePath: path })
    : previousEdit
      ? await previousEdit.then((maybeResult) =>
          maybeResult && 'content' in maybeResult
            ? maybeResult.content
            : requestOptionalFile({ ...params, filePath: path }),
        )
      : await requestOptionalFile({ ...params, filePath: path })

  const hadFreshWholeFileAuthorization =
    typeof latestContent === 'string' &&
    isWholeFileReadAuthorizationFresh(fileProcessingState, path, latestContent)

  if (hasStoredWholeFileAuthorization && !hadFreshWholeFileAuthorization) {
    revokeWholeFileReadAuthorization(fileProcessingState, path)
  }

  const requireFreshReadCapability =
    fileProcessingState.strictReadBeforeEdit === true &&
    !hadFreshWholeFileAuthorization

  if (requireFreshReadCapability && !hasAnyReadCapability) {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: [
              hasStoredWholeFileAuthorization
                ? `Edit blocked: ${path} changed after its last whole-file read, so the stored authorization was revoked.`
                : `Edit blocked: strict read-before-edit is enabled and no fresh read authorization exists for ${path}.`,
              `Next: call read_files with paths: ["${path}"] for whole-file authorization, or include a matching fresh basedOnRead capability on every replacement.`,
            ].join('\n'),
          },
        },
      ],
    }
  }

  const newPromise: Promise<FileProcessing<'str_replace'>> = processStrReplace({
    path,
    replacements,
    atomic,
    requireFreshReadCapability,
    initialContentPromise: Promise.resolve(latestContent),
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
  let hadAutoCorrect = false
  if ('error' in strReplaceResult) {
    // A preflight syntax failure is semantically different from a stale-anchor
    // failure: the agent's oldString was fine, the new content just had a
    // syntax error. Don't penalize the circuit breaker or force a re-read —
    // the agent only needs to fix the syntax, not re-read the file or switch
    // tools. (Fix C circuit breaker only counts real processing failures.)
    if (!strReplaceResult.preflightSyntaxError) {
      fileProcessingState.failedEditRequiresReadByPath[path] = true
      revokeWholeFileReadAuthorization(fileProcessingState, path)
      // Fix C: a hard error consumes the per-path failure budget.
      fileProcessingState.consecutiveStrReplaceFailuresByPath[path] =
        (fileProcessingState.consecutiveStrReplaceFailuresByPath[path] ?? 0) + 1
      if (
        fileProcessingState.consecutiveStrReplaceFailuresByPath[path] >=
        STR_REPLACE_MAX_CONSECUTIVE_FAILURES
      ) {
        strReplaceResult.error = [
          strReplaceResult.error,
          `str_replace retry limit reached for \`${path}\` after ${fileProcessingState.consecutiveStrReplaceFailuresByPath[path]} failed or auto-corrected attempts in this turn.`,
          'Do not retry another remembered str_replace batch. Switch to rewrite_symbol for a whole symbol, replace_range with a fresh expectedHash for a known block, or write_file when reconstructing the whole file is safer.',
        ].join('\n\n')
      }
    }
  } else {
    // Fix C: an auto-corrected near-match is a weak/suspect outcome and also
    // counts toward the circuit breaker. A clean exact-match success keeps any
    // existing failure budget intact so failure -> success -> failure loops
    // cannot run forever. The state naturally resets at the next turn.
    hadAutoCorrect = strReplaceResult.messages.some((msg) =>
      msg.includes(NEAR_MATCH_AUTOCORRECT_MARKER),
    )
    if (hadAutoCorrect || (strReplaceResult.failedReplacementCount ?? 0) > 0) {
      fileProcessingState.consecutiveStrReplaceFailuresByPath[path] =
        (fileProcessingState.consecutiveStrReplaceFailuresByPath[path] ?? 0) + 1
    }
    // Strict read-before-edit: read authorization is sticky once granted by
    // read_files or write_file. Successful edits on the same path remain
    // authorized for subsequent edits; only a failed edit (which sets
    // failedEditRequiresReadByPath) or an externally-changed file (anchored
    // with a fresh basedOnRead capability) re-enables the strict gate.
  }

  const application = await coordinateEditApplication<'str_replace'>({
    toolName: 'str_replace',
    fileProcessingState,
    paths: [path],
    rejectionRequiresRead: !strReplaceResult.preflightSyntaxError,
    wholeFileContentByPath:
      hadFreshWholeFileAuthorization && 'content' in strReplaceResult
        ? new Map([[path, strReplaceResult.content]])
        : undefined,
    onApplied: () => {
      if (
        structuralRecovery &&
        !hadAutoCorrect &&
        'failedReplacementCount' in strReplaceResult &&
        (strReplaceResult.failedReplacementCount ?? 0) === 0
      ) {
        delete fileProcessingState.consecutiveStrReplaceFailuresByPath[path]
      }
    },
    apply: () =>
      postStreamProcessing<'str_replace'>(
        strReplaceResult,
        fileProcessingState,
        writeToClient,
        requestClientToolCall,
      ),
  })

  if (application.status === 'threw') {
    return {
      output: [
        {
          type: 'json',
          value: {
            file: path,
            errorMessage: `str_replace failed while applying the prepared patch: ${application.error instanceof Error ? application.error.message : String(application.error)}. Re-read the file before retrying.`,
          },
        },
      ],
    }
  }

  const clientToolResult = application.output

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
              ...('messages' in strReplaceResult
                ? strReplaceResult.messages
                : []),
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
