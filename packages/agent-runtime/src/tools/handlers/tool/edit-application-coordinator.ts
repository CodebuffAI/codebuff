import { getContentHash } from '@codebuff/common/util/content-hash'

import {
  clearEditRereadRequirement,
  markEditRequiresFreshRead,
} from './edit-read-state'

import type { FileProcessingState } from './write-file'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { ToolName } from '@codebuff/common/tools/constants'

type CoordinatedApplication<T extends ToolName> =
  | { status: 'applied'; output: CodebuffToolOutput<T> }
  | { status: 'rejected'; output: CodebuffToolOutput<T> }
  | { status: 'threw'; error: unknown }

function hasExplicitError(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || value === undefined) return false
  if (Array.isArray(value)) {
    return value.some((item) => hasExplicitError(item, depth + 1))
  }
  if (typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  if (
    record.errorMessage !== undefined ||
    (record.error !== undefined && record.error !== null) ||
    record.success === false ||
    record.applied === false ||
    record.status === 'failed' ||
    record.status === 'error' ||
    record.status === 'blocked'
  ) {
    return true
  }
  return Object.values(record).some((nested) =>
    hasExplicitError(nested, depth + 1),
  )
}

function hasPositiveApplicationEvidence(
  value: unknown,
  paths: ReadonlySet<string>,
  depth = 0,
): boolean {
  if (depth > 6 || value === null || value === undefined) return false
  if (Array.isArray(value)) {
    return value.some((item) =>
      hasPositiveApplicationEvidence(item, paths, depth + 1),
    )
  }
  if (typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (
    record.kind === 'file_mutation_result' &&
    (record.outcome === 'applied' ||
      record.outcome === 'partial' ||
      record.outcome === 'rollback_incomplete') &&
    record.authorityTier !== null &&
    Array.isArray(record.actions)
  ) {
    const confirmedPaths = new Set<string>()
    for (const action of record.actions) {
      if (
        !action ||
        typeof action !== 'object' ||
        (action as Record<string, unknown>).outcome !== 'applied'
      ) {
        continue
      }
      const actionRecord = action as Record<string, unknown>
      if (typeof actionRecord.path === 'string') {
        confirmedPaths.add(actionRecord.path)
      }
      if (
        actionRecord.action === 'move' &&
        typeof actionRecord.destinationPath === 'string'
      ) {
        confirmedPaths.add(actionRecord.destinationPath)
      }
    }
    return [...paths].every((path) => confirmedPaths.has(path))
  }
  return Object.values(record).some((nested) =>
    hasPositiveApplicationEvidence(nested, paths, depth + 1),
  )
}

function unconfirmedApplicationOutput<T extends ToolName>(
  paths: string[],
  clientOutput?: CodebuffToolOutput<T>,
): CodebuffToolOutput<T> {
  return [
    ...(clientOutput ?? []),
    {
      type: 'json',
      value: {
        ...(paths.length === 1 ? { file: paths[0] } : {}),
        errorMessage:
          'The client returned no positive edit application evidence, so the harness could not confirm that any filesystem change occurred. Re-read affected files before retrying.',
        ...(paths.length > 1
          ? {
              failures: paths.map((path) => ({
                editIndex: -1,
                path,
                errorMessage: 'Client application was not confirmed.',
              })),
            }
          : {}),
      },
    },
  ] as CodebuffToolOutput<T>
}

export function editOutputHasError<T extends ToolName>(
  output: CodebuffToolOutput<T>,
): boolean {
  return hasExplicitError(output)
}

export function invalidatePreparedEditPaths(params: {
  fileProcessingState: FileProcessingState
  paths: Iterable<string>
  revokeReadAuthorization?: boolean
  requiresFreshRead?: boolean
  reason?: Parameters<typeof markEditRequiresFreshRead>[0]['reason']
  sourceTool?: string
}): void {
  const {
    fileProcessingState,
    paths,
    revokeReadAuthorization = true,
    requiresFreshRead = true,
    reason = 'application_rejected',
    sourceTool,
  } = params
  for (const path of new Set(paths)) {
    if (!path) continue
    delete fileProcessingState.promisesByPath[path]
    if (requiresFreshRead) {
      markEditRequiresFreshRead({
        fileProcessingState,
        path,
        reason,
        sourceTool,
        revokeReadAuthorization,
      })
    }
  }
}

export function commitAppliedEditPaths(params: {
  fileProcessingState: FileProcessingState
  paths: Iterable<string>
  wholeFileContentByPath?: ReadonlyMap<string, string>
}): void {
  const { fileProcessingState, paths, wholeFileContentByPath } = params
  for (const path of new Set(paths)) {
    if (!path) continue
    clearEditRereadRequirement(fileProcessingState, path)
    const wholeFileContent = wholeFileContentByPath?.get(path)
    if (
      typeof wholeFileContent === 'string' &&
      fileProcessingState.strictReadBeforeEdit
    ) {
      fileProcessingState.readAuthorizationsByPath ??= {}
      fileProcessingState.readAuthorizationHashesByPath ??= {}
      fileProcessingState.readAuthorizationsByPath[path] = true
      fileProcessingState.readAuthorizationHashesByPath[path] =
        getContentHash(wholeFileContent)
    }
  }
}

export async function coordinateEditApplication<T extends ToolName>(params: {
  toolName: T
  fileProcessingState: FileProcessingState
  paths: Iterable<string>
  apply: () => Promise<CodebuffToolOutput<T>>
  rejectionRequiresRead?: boolean
  wholeFileContentByPath?: ReadonlyMap<string, string>
  onApplied?: () => void
}): Promise<CoordinatedApplication<T>> {
  const paths = [...new Set(params.paths)]
  let output: CodebuffToolOutput<T>
  try {
    output = await params.apply()
  } catch (error) {
    invalidatePreparedEditPaths({
      fileProcessingState: params.fileProcessingState,
      paths,
      reason: 'application_threw',
      sourceTool: params.toolName,
    })
    return { status: 'threw', error }
  }

  if (output.length === 0) {
    invalidatePreparedEditPaths({
      fileProcessingState: params.fileProcessingState,
      paths,
      reason: 'application_unconfirmed',
      sourceTool: params.toolName,
    })
    return {
      status: 'rejected',
      output: unconfirmedApplicationOutput<T>(paths),
    }
  }

  if (editOutputHasError(output)) {
    if (params.rejectionRequiresRead !== false) {
      invalidatePreparedEditPaths({
        fileProcessingState: params.fileProcessingState,
        paths,
        reason: 'application_rejected',
        sourceTool: params.toolName,
      })
    } else {
      for (const path of paths) {
        delete params.fileProcessingState.promisesByPath[path]
      }
    }
    return { status: 'rejected', output }
  }

  if (!hasPositiveApplicationEvidence(output, new Set(paths))) {
    invalidatePreparedEditPaths({
      fileProcessingState: params.fileProcessingState,
      paths,
      reason: 'application_unconfirmed',
      sourceTool: params.toolName,
    })
    return {
      status: 'rejected',
      output: unconfirmedApplicationOutput<T>(paths, output),
    }
  }

  commitAppliedEditPaths({
    fileProcessingState: params.fileProcessingState,
    paths,
    wholeFileContentByPath: params.wholeFileContentByPath,
  })
  params.onApplied?.()
  return { status: 'applied', output }
}
