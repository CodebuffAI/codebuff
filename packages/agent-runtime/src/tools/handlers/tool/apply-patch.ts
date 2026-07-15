import { coordinateEditApplication } from './edit-application-coordinator'
import {
  markEditRequiresFreshRead,
  strictEditAuthorizationError,
} from './edit-read-state'
import {
  formatUnsafeToolPathError,
  hasWholeFileReadAuthorization,
  isWholeFileReadAuthorizationFresh,
  normalizeToolPath,
  revokeWholeFileReadAuthorization,
} from './write-file'
import {
  decodeReadCapabilityToken,
  readCapabilityMatchesScope,
} from '@codebuff/common/util/content-hash'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'

function normalizePatchReadCapabilities(params: {
  values: Array<string | { startLine: number; endLine: number; hash: string }>
  projectId: string
  path: string
  runId: string
}):
  | {
      ok: true
      capabilities: Array<{
        startLine: number
        endLine: number
        hash: string
      }>
      allBound: boolean
    }
  | { ok: false; errorMessage: string } {
  const capabilities: Array<{
    startLine: number
    endLine: number
    hash: string
  }> = []
  let allBound = params.values.length > 0
  for (const value of params.values) {
    if (typeof value !== 'string') {
      allBound = false
      capabilities.push(value)
      continue
    }
    const decoded = decodeReadCapabilityToken(value)
    if (typeof decoded === 'string') {
      return { ok: false, errorMessage: decoded }
    }
    if (
      !readCapabilityMatchesScope(decoded, {
        projectId: params.projectId,
        path: params.path,
        runId: params.runId,
      })
    ) {
      return {
        ok: false,
        errorMessage: `apply_patch blocked: a readCapability belongs to a different project, path, or agent run. Re-read ${params.path} in this run and copy its cap.v3 token.`,
      }
    }
    capabilities.push({
      startLine: decoded.startLine,
      endLine: decoded.endLine,
      hash: decoded.hash,
    })
  }
  return { ok: true, capabilities, allBound }
}

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
  const normalizedCapabilities =
    operation.type === 'update_file'
      ? normalizePatchReadCapabilities({
          values: operation.basedOnRead ?? [],
          projectId: params.fileContext?.projectRoot ?? '',
          path,
          runId: params.runId ?? '',
        })
      : { ok: true as const, capabilities: [], allBound: false }
  if (!normalizedCapabilities.ok) {
    return {
      output: [
        {
          type: 'json' as const,
          value: {
            file: path,
            errorMessage: normalizedCapabilities.errorMessage,
            errorCode: 'fresh_read_required',
            recovery: { tool: 'read_files' as const, input: { paths: [path] } },
          },
        },
      ],
    }
  }
  if (operation.type !== 'create_file') {
    const hasStoredAuthorization = hasWholeFileReadAuthorization(
      fileProcessingState,
      path,
    )
    const hasRangeCapabilities =
      operation.type === 'update_file' && normalizedCapabilities.allBound
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
      operation: {
        ...toolCall.input.operation,
        path,
        ...(toolCall.input.operation.type === 'update_file'
          ? { basedOnRead: normalizedCapabilities.capabilities }
          : {}),
      },
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
