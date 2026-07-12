import { coordinateEditApplication } from './edit-application-coordinator'
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
    if (
      fileProcessingState.strictReadBeforeEdit &&
      !hasStoredAuthorization &&
      !hasRangeCapabilities
    ) {
      return {
        output: [
          {
            type: 'json' as const,
            value: {
              file: path,
              errorMessage: `Edit blocked: strict read-before-edit is enabled and no fresh read authorization exists for ${path}. Read the file first; update patches may instead provide fresh basedOnRead capabilities.`,
            },
          },
        ],
      }
    }
    if (hasStoredAuthorization) {
      const currentContent = await requestOptionalFile({
        ...params,
        filePath: path,
      })
      if (
        typeof currentContent !== 'string' ||
        !isWholeFileReadAuthorizationFresh(
          fileProcessingState,
          path,
          currentContent,
        )
      ) {
        revokeWholeFileReadAuthorization(fileProcessingState, path)
        return {
          output: [
            {
              type: 'json' as const,
              value: {
                file: path,
                errorMessage: `Edit blocked: ${path} changed after its last whole-file read. Re-read it before applying the patch.`,
              },
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
