import { coordinateEditApplication } from './edit-application-coordinator'
import {
  markEditRequiresFreshRead,
  strictEditAuthorizationError,
} from './edit-read-state'
import {
  formatUnsafeToolPathError,
  isWholeFileReadAuthorizationFresh,
  normalizeToolPath,
  revokeWholeFileReadAuthorization,
} from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleApplyPatch = (async (params) => {
  const {
    previousToolCallFinished,
    toolCall,
    fileProcessingState,
    requestOptionalFile,
    requestClientToolCall,
  } = params
  const path = normalizeToolPath(toolCall.input.operation.path)
  if (!path) {
    return {
      output: [
        {
          type: 'json' as const,
          value: {
            errorMessage: formatUnsafeToolPathError(
              'apply_patch',
              toolCall.input.operation.path,
            ),
          },
        },
      ],
    }
  }
  await previousToolCallFinished
  const operation = toolCall.input.operation
  if (operation.type !== 'create_file') {
    const hasStoredAuthorization = Boolean(
      fileProcessingState.readAuthorizationsByPath?.[path] ||
        fileProcessingState.readAuthorizationHashesByPath?.[path],
    )
    const hasRangeCapabilities =
      operation.type === 'update_file' &&
      Array.isArray(operation.basedOnRead) &&
      operation.basedOnRead.length > 0
    if (!hasStoredAuthorization) {
      const authorizationError = strictEditAuthorizationError({
        fileProcessingState,
        path,
        toolName: 'apply_patch',
        hasFreshWholeFileAuthorization: false,
        hasScopedCapability: hasRangeCapabilities,
      })
      if (authorizationError) {
        return {
          output: [
            {
              type: 'json' as const,
              value: { file: path, ...authorizationError },
            },
          ],
        }
      }
    }
    if (hasStoredAuthorization) {
      const currentContent = await requestOptionalFile({
        ...params,
        filePath: path,
      })
      const hasFreshWholeFileAuthorization =
        typeof currentContent === 'string' &&
        isWholeFileReadAuthorizationFresh(
          fileProcessingState,
          path,
          currentContent,
        )
      if (!hasFreshWholeFileAuthorization) {
        revokeWholeFileReadAuthorization(fileProcessingState, path)
        markEditRequiresFreshRead({
          fileProcessingState,
          path,
          reason: 'stale_snapshot',
          sourceTool: 'apply_patch',
          revokeReadAuthorization: false,
        })
      }
      const authorizationError = strictEditAuthorizationError({
        fileProcessingState,
        path,
        toolName: 'apply_patch',
        hasFreshWholeFileAuthorization,
        hasScopedCapability: hasRangeCapabilities,
        authorizationWasStale: !hasFreshWholeFileAuthorization,
      })
      if (authorizationError) {
        return {
          output: [
            {
              type: 'json' as const,
              value: { file: path, ...authorizationError },
            },
          ],
        }
      }
    }
  }
  const clientToolCall = {
    toolCallId: toolCall.toolCallId,
    toolName: 'apply_patch' as const,
    input: {
      ...toolCall.input,
      operation: { ...toolCall.input.operation, path },
    },
  }
  const application = await coordinateEditApplication<'apply_patch'>({
    toolName: 'apply_patch',
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
            errorMessage: `apply_patch failed while applying the prepared patch: ${application.error instanceof Error ? application.error.message : String(application.error)}. Re-read the file before retrying.`,
          },
        },
      ],
    }
  }
  return { output: application.output }
}) satisfies CodebuffToolHandlerFunction<'apply_patch'>
