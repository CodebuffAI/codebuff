import {
  formatUnsafeToolPathError,
  grantWholeFileReadAuthorization,
  isWholeFileReadAuthorizationFresh,
  normalizeToolPath,
  revokeWholeFileReadAuthorization,
} from './write-file'
import {
  coordinateEditApplication,
  invalidatePreparedEditPaths,
} from './edit-application-coordinator'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleReplaceRange = (async (params) => {
  const {
    previousToolCallFinished,
    toolCall,
    fileProcessingState,
    requestClientToolCall,
    requestOptionalFile,
  } = params
  const path = normalizeToolPath(toolCall.input.path)
  if (!path) {
    return {
      output: [
        {
          type: 'json' as const,
          value: {
            file: toolCall.input.path,
            errorMessage: formatUnsafeToolPathError(
              'replace_range',
              toolCall.input.path,
            ),
          },
        },
      ],
    }
  }

  await previousToolCallFinished
  const hasFreshnessAnchor =
    toolCall.input.expectedHash !== undefined &&
    toolCall.input.expectedHash !== null &&
    toolCall.input.expectedHash !== ''
  const currentContent =
    typeof requestOptionalFile === 'function'
      ? await requestOptionalFile({ ...params, filePath: path })
      : null
  const hadStoredWholeFileAuthorization = Boolean(
    fileProcessingState.readAuthorizationsByPath?.[path] ||
    fileProcessingState.readAuthorizationHashesByPath?.[path],
  )
  const hadFreshWholeFileAuthorization =
    typeof currentContent === 'string' &&
    isWholeFileReadAuthorizationFresh(fileProcessingState, path, currentContent)
  if (hadStoredWholeFileAuthorization && !hadFreshWholeFileAuthorization) {
    revokeWholeFileReadAuthorization(fileProcessingState, path)
  }
  if (
    fileProcessingState.strictReadBeforeEdit &&
    !hasFreshnessAnchor &&
    !hadFreshWholeFileAuthorization
  ) {
    invalidatePreparedEditPaths({
      fileProcessingState,
      paths: [path],
    })
    return {
      output: [
        {
          type: 'json' as const,
          value: {
            file: path,
            errorMessage: hadStoredWholeFileAuthorization
              ? `replace_range blocked: ${path} changed after its last whole-file read, so the stored authorization was revoked. Call read_files for this exact path before retrying, or supply the expectedHash from a fresh read_files.ranges call.`
              : `replace_range blocked: strict read-before-edit is enabled and no fresh read authorization exists for ${path}. Call read_files for this exact path before retrying, or supply the expectedHash from a fresh read_files.ranges call.`,
          },
        },
      ],
    }
  }

  const clientToolCall = {
    toolCallId: toolCall.toolCallId,
    toolName: 'replace_range' as const,
    input: {
      ...toolCall.input,
      path,
    },
  }
  const application = await coordinateEditApplication<'replace_range'>({
    toolName: 'replace_range',
    fileProcessingState,
    paths: [path],
    apply: () => requestClientToolCall(clientToolCall),
  })
  if (application.status === 'threw') {
    return {
      output: [
        {
          type: 'json' as const,
          value: {
            file: path,
            errorMessage: `replace_range failed while applying the prepared range: ${application.error instanceof Error ? application.error.message : String(application.error)}. Re-read the range before retrying.`,
          },
        },
      ],
    }
  }
  if (application.status === 'applied' && hadFreshWholeFileAuthorization) {
    const updatedContent =
      typeof requestOptionalFile === 'function'
        ? await requestOptionalFile({ ...params, filePath: path })
        : null
    if (typeof updatedContent === 'string') {
      grantWholeFileReadAuthorization(fileProcessingState, path, updatedContent)
    } else {
      revokeWholeFileReadAuthorization(fileProcessingState, path)
    }
  }
  return { output: application.output }
}) satisfies CodebuffToolHandlerFunction<'replace_range'>
