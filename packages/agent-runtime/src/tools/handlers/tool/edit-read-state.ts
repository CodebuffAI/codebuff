import type { FileProcessingState } from './write-file'
import type {
  EditRereadReason,
  EditRereadRequirement,
} from '@codebuff/common/types/session-state'

export function markEditRequiresFreshRead(params: {
  fileProcessingState: FileProcessingState
  path: string
  reason: EditRereadReason
  sourceTool?: string
  revokeReadAuthorization?: boolean
}): void {
  const {
    fileProcessingState,
    path,
    reason,
    sourceTool,
    revokeReadAuthorization = true,
  } = params
  fileProcessingState.failedEditRequiresReadByPath[path] = true
  fileProcessingState.editRereadRequirementsByPath ??= {}
  fileProcessingState.editRereadRequirementsByPath[path] = {
    reason,
    ...(sourceTool ? { sourceTool } : {}),
  }
  if (revokeReadAuthorization) {
    delete fileProcessingState.readAuthorizationsByPath?.[path]
    delete fileProcessingState.readAuthorizationHashesByPath?.[path]
  }
}

export function clearEditRereadRequirement(
  fileProcessingState: FileProcessingState,
  path: string,
): void {
  delete fileProcessingState.failedEditRequiresReadByPath[path]
  delete fileProcessingState.editRereadRequirementsByPath?.[path]
}

export function getEditRereadRequirement(
  fileProcessingState: FileProcessingState,
  path: string,
): EditRereadRequirement | undefined {
  return fileProcessingState.editRereadRequirementsByPath?.[path]
}

export function strictEditAuthorizationError(params: {
  fileProcessingState: FileProcessingState
  path: string
  toolName: string
  hasFreshWholeFileAuthorization: boolean
  hasScopedCapability?: boolean
  allowScopedCapability?: boolean
  authorizationWasStale?: boolean
  wholeFileRequired?: boolean
}):
  | {
      errorMessage: string
      errorCode: 'fresh_read_required'
      recovery: { tool: 'read_files'; input: { paths: string[] } }
    }
  | undefined {
  const {
    fileProcessingState,
    path,
    toolName,
    hasFreshWholeFileAuthorization,
    hasScopedCapability = false,
    allowScopedCapability = true,
    authorizationWasStale = false,
    wholeFileRequired = false,
  } = params
  const prior = getEditRereadRequirement(fileProcessingState, path)
  const recoveringFromFailedEdit = Boolean(
    fileProcessingState.failedEditRequiresReadByPath[path],
  )
  if (
    !fileProcessingState.strictReadBeforeEdit &&
    !prior &&
    !recoveringFromFailedEdit
  ) {
    return undefined
  }
  if (hasFreshWholeFileAuthorization) return undefined
  if (allowScopedCapability && hasScopedCapability) return undefined

  const firstLine = prior
    ? prior.reason === 'stale_snapshot'
      ? `${toolName} blocked for ${path}: a previous ${prior.sourceTool ?? 'edit'} found that the file changed after its last whole-file read and requires a fresh read before retrying.`
      : `${toolName} blocked for ${path}: a previous ${prior.sourceTool ?? 'edit'} ${formatReason(prior.reason)} and requires a fresh read before retrying.`
    : recoveringFromFailedEdit
      ? toolName === 'str_replace'
        ? `${toolName} blocked for ${path}: a previous str_replace failed for this file and requires a fresh read before retrying.`
        : `${toolName} blocked for ${path}: a previous edit failed and requires a fresh read before retrying.`
      : authorizationWasStale
        ? `${toolName} blocked for ${path}: the file changed after its last whole-file read, so the stored authorization was revoked.`
        : `${toolName} blocked for ${path}: strict read-before-edit is enabled and no fresh read authorization exists.`
  const scopeNote = wholeFileRequired
    ? ' A prior range-anchored edit or scoped range capability cannot authorize a whole-file overwrite.'
    : ' A scoped edit may instead provide the fresh capability/hash returned by read_files.'
  return {
    errorMessage: `${firstLine}\nNext: call read_files with paths: [${JSON.stringify(path)}].${scopeNote}`,
    errorCode: 'fresh_read_required',
    recovery: { tool: 'read_files', input: { paths: [path] } },
  }
}

function formatReason(reason: EditRereadReason): string {
  switch (reason) {
    case 'preflight_failed':
      return 'preflight failed'
    case 'stale_snapshot':
      return 'detected a stale file snapshot'
    case 'stale_capability':
      return 'used a stale read capability'
    case 'application_rejected':
      return 'application was rejected'
    case 'application_unconfirmed':
      return 'application could not be confirmed'
    case 'application_threw':
      return 'application threw'
  }
}
