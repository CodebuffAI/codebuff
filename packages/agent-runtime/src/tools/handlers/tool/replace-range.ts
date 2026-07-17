import {
  formatUnsafeToolPathError,
  grantWholeFileReadAuthorization,
  hasWholeFileReadAuthorization,
  isWholeFileReadAuthorizationFresh,
  normalizeToolPath,
  revokeWholeFileReadAuthorization,
} from './write-file'
import {
  coordinateEditApplication,
  invalidatePreparedEditPaths,
} from './edit-application-coordinator'
import {
  decodeReadCapabilityToken,
  readCapabilityMatchesScope,
} from '@codebuff/common/util/content-hash'

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
  let hasBoundReadCapability = false
  if (toolCall.input.readCapability) {
    const decoded = decodeReadCapabilityToken(toolCall.input.readCapability)
    if (
      typeof decoded === 'string' ||
      !readCapabilityMatchesScope(decoded, {
        projectId: params.fileContext?.projectRoot ?? '',
        path,
        runId: params.runId ?? '',
      })
    ) {
      return {
        output: [
          {
            type: 'json' as const,
            value: {
              file: path,
              errorMessage:
                typeof decoded === 'string'
                  ? decoded
                  : `replace_range blocked: the readCapability belongs to a different project, path, or agent run. Re-read ${path} in this run and copy its cap.v3 token.`,
              errorCode: 'fresh_read_required',
              recovery: {
                tool: 'read_files',
                input: {
                  paths: [],
                  ranges: [
                    {
                      path,
                      startLine: toolCall.input.startLine,
                      endLine: toolCall.input.endLine,
                    },
                  ],
                },
              },
            },
          },
        ],
      }
    }
    hasBoundReadCapability = true
  }
  const currentContent =
    typeof requestOptionalFile === 'function'
      ? await requestOptionalFile({ ...params, filePath: path })
      : null
  const hadStoredWholeFileAuthorization = hasWholeFileReadAuthorization(
    fileProcessingState,
    path,
  )
  const hadFreshWholeFileAuthorization =
    typeof currentContent === 'string' &&
    isWholeFileReadAuthorizationFresh(fileProcessingState, path, currentContent)
  if (hadStoredWholeFileAuthorization && !hadFreshWholeFileAuthorization) {
    revokeWholeFileReadAuthorization(fileProcessingState, path)
  }
  if (
    fileProcessingState.strictReadBeforeEdit &&
    !hasBoundReadCapability &&
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
              ? `replace_range blocked: ${path} changed after its last whole-file read, so the stored authorization was revoked. Call read_files with ranges: [{ "path": "${path}", "startLine": ${toolCall.input.startLine}, "endLine": ${toolCall.input.endLine} }] and retry with only its cap.v3 readCapability plus newContent.`
              : `replace_range blocked: strict read-before-edit is enabled and no fresh path-bound read authorization exists for ${path}. Call read_files with ranges: [{ "path": "${path}", "startLine": ${toolCall.input.startLine}, "endLine": ${toolCall.input.endLine} }] and retry with only its cap.v3 readCapability plus newContent. Legacy startLine/endLine/expectedHash tuples remain freshness checks only and cannot authorize an unread path.`,
            errorCode: 'fresh_read_required',
            recovery: {
              tool: 'read_files',
              input: {
                paths: [],
                ranges: [
                  {
                    path,
                    startLine: toolCall.input.startLine,
                    endLine: toolCall.input.endLine,
                  },
                ],
              },
            },
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
