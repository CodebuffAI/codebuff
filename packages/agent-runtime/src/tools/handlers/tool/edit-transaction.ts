import { getContentHash } from '@codebuff/common/util/content-hash'
import {
  MAX_FILE_CHANGES_PER_TRANSACTION,
  MAX_TRANSACTION_FILE_BYTES,
  MAX_TRANSACTION_INPUT_BYTES,
  MAX_TRANSACTION_ROLLBACK_BYTES,
  MAX_TRANSACTION_UNIQUE_PATHS,
} from '@codebuff/common/actions'

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
import { processEditTransaction } from '../../../process-edit-transaction'
import {
  preflightValidateSyntax,
  formatPreflightErrorMessage,
} from '../../../util/preflight-syntax-validation'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { FileChange } from '@codebuff/common/actions'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export const TRANSACTION_SNAPSHOT_CONCURRENCY = 8

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++
        results[index] = await mapper(values[index]!, index)
      }
    },
  )
  await Promise.all(workers)
  return results
}

export const handleEditTransaction = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<'edit_transaction'>

    fileProcessingState: FileProcessingState
    logger: Logger

    requestClientToolCall: (
      toolCall: ClientToolCall<'edit_transaction'>,
    ) => Promise<CodebuffToolOutput<'edit_transaction'>>
    requestOptionalFile: RequestOptionalFileFn
    fileContext?: ProjectFileContext
    runId?: string
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<'edit_transaction'> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    fileProcessingState,
    logger,
    requestClientToolCall,
    requestOptionalFile,
  } = params
  const edits = toolCall.input.edits.map((edit) => ({
    ...edit,
    path: normalizeToolPath(edit.path),
    ...(edit.type === 'move'
      ? { destinationPath: normalizeToolPath(edit.destinationPath) }
      : {}),
  }))

  const requestedPaths = new Set(
    edits.flatMap((edit) =>
      edit.type === 'move' ? [edit.path, edit.destinationPath] : [edit.path],
    ),
  )
  const inputBytes = Buffer.byteLength(JSON.stringify(edits))
  const requestLimitMessage =
    edits.length > MAX_FILE_CHANGES_PER_TRANSACTION
      ? `edit_transaction accepts at most ${MAX_FILE_CHANGES_PER_TRANSACTION} edits.`
      : requestedPaths.size > MAX_TRANSACTION_UNIQUE_PATHS
        ? `edit_transaction accepts at most ${MAX_TRANSACTION_UNIQUE_PATHS} unique paths.`
        : inputBytes > MAX_TRANSACTION_INPUT_BYTES
          ? `edit_transaction input exceeds the ${MAX_TRANSACTION_INPUT_BYTES}-byte limit.`
          : null
  if (requestLimitMessage) {
    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: `${requestLimitMessage} Split the work into bounded transactions.`,
            failures: [
              {
                editIndex: -1,
                path: [...requestedPaths].join(', '),
                errorMessage: requestLimitMessage,
              },
            ],
          },
        },
      ],
    }
  }

  // Block the whole transaction rather than forwarding an unsafe/empty path.
  // Report the original input so the agent can correct the exact edit.
  const unsafePathIndex = edits.findIndex(
    (edit) => !edit.path || (edit.type === 'move' && !edit.destinationPath),
  )
  if (unsafePathIndex !== -1) {
    const originalEdit = toolCall.input.edits[unsafePathIndex]
    const originalPath =
      originalEdit.type === 'move' && !edits[unsafePathIndex].destinationPath
        ? originalEdit.destinationPath
        : originalEdit.path
    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: formatUnsafeToolPathError(
              'edit_transaction',
              originalPath,
            ),
            failures: [
              {
                editIndex: unsafePathIndex,
                path: originalPath,
                errorMessage: formatUnsafeToolPathError(
                  'edit_transaction',
                  originalPath,
                ),
              },
            ],
          },
        },
      ],
    }
  }

  await previousToolCallFinished

  const uniquePaths = Array.from(
    new Set(
      edits.flatMap((edit) =>
        edit.type === 'move' ? [edit.path, edit.destinationPath] : [edit.path],
      ),
    ),
  )
  const initialContentByPath = new Map<string, string | null>()
  const snapshots = await mapWithConcurrency(
    uniquePaths,
    TRANSACTION_SNAPSHOT_CONCURRENCY,
    async (path) => {
      const previousPromises = fileProcessingState.promisesByPath[path]
      const previousEdit = previousPromises?.[previousPromises.length - 1]
      const initialContent = previousEdit
        ? await previousEdit.then((maybeResult) =>
            maybeResult && 'content' in maybeResult
              ? maybeResult.content
              : requestOptionalFile({ ...params, filePath: path }),
          )
        : await requestOptionalFile({ ...params, filePath: path })

      return initialContent
    },
  )
  uniquePaths.forEach((path, index) => {
    initialContentByPath.set(path, snapshots[index]!)
  })
  let rollbackBytes = 0
  for (const [index, path] of uniquePaths.entries()) {
    const content = snapshots[index]
    const bytes = content === null ? 0 : Buffer.byteLength(content)
    rollbackBytes += bytes
    if (
      bytes > MAX_TRANSACTION_FILE_BYTES ||
      rollbackBytes > MAX_TRANSACTION_ROLLBACK_BYTES
    ) {
      const message =
        bytes > MAX_TRANSACTION_FILE_BYTES
          ? `Transaction file ${path} exceeds the ${MAX_TRANSACTION_FILE_BYTES}-byte per-file limit.`
          : `Transaction rollback state exceeds the ${MAX_TRANSACTION_ROLLBACK_BYTES}-byte limit.`
      return {
        output: [
          {
            type: 'json',
            value: {
              errorMessage: `${message} No files were changed. Split the work into bounded transactions or range edits.`,
              failures: [
                {
                  editIndex: -1,
                  path,
                  errorMessage: message,
                },
              ],
            },
          },
        ],
      }
    }
  }

  const freshWholeFileAuthorizationPaths = new Set<string>()
  const staleWholeFileAuthorizationPaths = new Set<string>()
  for (const path of uniquePaths) {
    const initialContent = initialContentByPath.get(path)
    const hasStoredAuthorization = hasWholeFileReadAuthorization(
      fileProcessingState,
      path,
    )
    const isFresh =
      typeof initialContent === 'string' &&
      isWholeFileReadAuthorizationFresh(
        fileProcessingState,
        path,
        initialContent,
      )
    if (isFresh) {
      freshWholeFileAuthorizationPaths.add(path)
    } else if (hasStoredAuthorization) {
      staleWholeFileAuthorizationPaths.add(path)
      revokeWholeFileReadAuthorization(fileProcessingState, path)
    }
  }

  const requireFreshReadCapabilityForPaths = new Set<string>()
  if (fileProcessingState.strictReadBeforeEdit) {
    const failures: Array<{
      editIndex: number
      path: string
      errorMessage: string
    }> = []
    edits.forEach((edit, editIndex) => {
      if (
        edit.type === 'create' &&
        initialContentByPath.get(edit.path) === null
      ) {
        return
      }
      if (freshWholeFileAuthorizationPaths.has(edit.path)) return
      // Per-edit basedOnRead anchors satisfy strict mode without a prior read,
      // but every replacement must carry its own scoped capability.
      const hasBasedOnRead =
        edit.type === 'str_replace' &&
        Array.isArray(edit.replacements) &&
        edit.replacements.length > 0 &&
        edit.replacements.every((replacement) =>
          Boolean(replacement.basedOnRead),
        )
      if (hasBasedOnRead) {
        requireFreshReadCapabilityForPaths.add(edit.path)
        return
      }
      const hasRangeReadCapability =
        edit.type === 'replace_range' && Boolean(edit.readCapability)
      if (hasRangeReadCapability) {
        requireFreshReadCapabilityForPaths.add(edit.path)
        return
      }
      const rangeRecovery =
        edit.type === 'replace_range'
          ? ` Call read_files with ranges: [{ "path": "${edit.path}", "startLine": ${edit.startLine}, "endLine": ${edit.endLine} }] and retry with only its readCapability plus newContent.`
          : ''
      failures.push({
        editIndex,
        path: edit.path,
        errorMessage: staleWholeFileAuthorizationPaths.has(edit.path)
          ? `Edit blocked: ${edit.path} changed after its last whole-file read, so the stored authorization was revoked.${rangeRecovery || ` Call read_files with paths: ["${edit.path}"] before retrying, or include a matching fresh basedOnRead capability on every replacement.`}`
          : `Edit blocked: strict read-before-edit is enabled and no fresh read authorization exists for ${edit.path}.${rangeRecovery || ` Call read_files with paths: ["${edit.path}"] before retrying, or include a matching fresh basedOnRead capability on every replacement.`} Only a complete whole-file read registers reusable authorization for ${edit.path}; a range read only yields a scoped capability that must be passed explicitly as basedOnRead/readCapability on the edit.`,
      })
    })
    if (failures.length > 0) {
      return {
        output: [
          {
            type: 'json',
            value: {
              errorMessage: [
                'edit_transaction blocked: strict read-before-edit is enabled and one or more paths have no read authorization.',
                "Follow each failure's exact recovery selector. For replace_range, re-read that range and use only its readCapability; for str_replace, use a whole-file read or matching basedOnRead on every replacement.",
              ].join('\n'),
              failures,
            },
          },
        ],
      }
    }
  }

  const lifecycleFailures = edits.flatMap((edit, editIndex) => {
    const source = initialContentByPath.get(edit.path)
    if (edit.type === 'create' && source !== null) {
      return [
        {
          editIndex,
          path: edit.path,
          errorMessage: 'Create destination already exists.',
        },
      ]
    }
    if (
      (edit.type === 'delete' || edit.type === 'move') &&
      typeof source !== 'string'
    ) {
      return [
        {
          editIndex,
          path: edit.path,
          errorMessage: `${edit.type === 'delete' ? 'Delete' : 'Move'} source does not exist.`,
        },
      ]
    }
    if (
      edit.type === 'move' &&
      initialContentByPath.get(edit.destinationPath) !== null
    ) {
      return [
        {
          editIndex,
          path: edit.destinationPath,
          errorMessage: 'Move destination already exists.',
        },
      ]
    }
    return []
  })
  if (lifecycleFailures.length > 0) {
    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage:
              'edit_transaction lifecycle preflight failed; no changes were applied.',
            failures: lifecycleFailures,
          },
        },
      ],
    }
  }

  const contentEdits = edits.filter(
    (edit) =>
      edit.type === 'str_replace' ||
      edit.type === 'structured' ||
      edit.type === 'replace_range' ||
      edit.type === 'rewrite_symbol' ||
      edit.type === 'patch' ||
      edit.type === 'write_file',
  )
  const transactionResult =
    contentEdits.length > 0
      ? await processEditTransaction({
          edits: contentEdits,
          initialContentByPath,
          logger,
          requireFreshReadCapabilityForPaths,
          readCapabilityIssuer: params.fileContext
            ? {
                projectId: params.fileContext.projectRoot,
                runId: params.runId ?? '',
              }
            : undefined,
        })
      : {
          tool: 'edit_transaction' as const,
          message: `Prepared ${edits.length} lifecycle edit(s).`,
          files: [],
        }

  if ('error' in transactionResult) {
    const failedPaths = new Set(
      transactionResult.failures.length > 0
        ? transactionResult.failures.map((failure) => failure.path)
        : uniquePaths,
    )
    const preserveAuthorizedPaths = [...failedPaths].filter((path) =>
      freshWholeFileAuthorizationPaths.has(path),
    )
    const requireFreshReadPaths = [...failedPaths].filter(
      (path) => !freshWholeFileAuthorizationPaths.has(path),
    )
    invalidatePreparedEditPaths({
      fileProcessingState,
      paths: preserveAuthorizedPaths,
      requiresFreshRead: false,
    })
    invalidatePreparedEditPaths({
      fileProcessingState,
      paths: requireFreshReadPaths,
      reason: 'preflight_failed',
      sourceTool: 'edit_transaction',
    })

    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: transactionResult.error,
            failures: transactionResult.failures,
          },
        },
      ],
    }
  }

  // --- VIRTUAL COMPILE TRANSACTIONS: Preflight Syntax Validation ---
  // Uses the shared preflightValidateSyntax utility which handles JS/TS
  // (Bun.Transpiler), Python (structural validation), and Go (structural
  // validation). In Node.js, JS/TS validation is gracefully skipped.
  for (const file of transactionResult.files) {
    const syntaxValidation = preflightValidateSyntax(file.path, file.content)
    if (!syntaxValidation.valid) {
      // A preflight syntax failure is NOT a stale-anchor failure: the edits
      // were structurally applied but the resulting content has a syntax
      // error. Don't force a re-read (markAllTransactionPathsAsRequiringRead)
      // — the agent only needs to fix the syntax, not re-read all files.
      // Report the first edit index that targeted this path so the agent can
      // identify which edit produced the broken content (multiple edits can
      // target the same path; the first is the most actionable starting point).
      const editIndex = edits.findIndex((edit) => edit.path === file.path)
      return {
        output: [
          {
            type: 'json',
            value: {
              errorMessage: formatPreflightErrorMessage(
                'edit_transaction',
                file.path,
                syntaxValidation.message,
              ),
              failures: [
                {
                  editIndex,
                  path: file.path,
                  errorMessage: syntaxValidation.message,
                },
              ],
            },
          },
        ],
      }
    }
  }

  for (const edit of edits) {
    if (edit.type !== 'create') continue
    const syntaxValidation = preflightValidateSyntax(edit.path, edit.content)
    if (!syntaxValidation.valid) {
      return {
        output: [
          {
            type: 'json',
            value: {
              errorMessage: formatPreflightErrorMessage(
                'edit_transaction',
                edit.path,
                syntaxValidation.message,
              ),
              failures: [
                {
                  editIndex: edits.indexOf(edit),
                  path: edit.path,
                  errorMessage: syntaxValidation.message,
                },
              ],
            },
          },
        ],
      }
    }
  }

  const preparedContentByPath = new Map(
    transactionResult.files.map((file) => [file.path, file]),
  )
  const firstContentEditIndexByPath = new Map<string, number>()
  edits.forEach((edit, index) => {
    if (
      !['create', 'delete', 'move'].includes(edit.type) &&
      !firstContentEditIndexByPath.has(edit.path)
    ) {
      firstContentEditIndexByPath.set(edit.path, index)
    }
  })
  const clientChanges: Array<{ index: number; change: FileChange }> = []
  for (const [path, file] of preparedContentByPath) {
    const initial = initialContentByPath.get(path) ?? null
    clientChanges.push({
      index: firstContentEditIndexByPath.get(path)!,
      change: {
        type: 'patch',
        path,
        content: file.patch,
        expectedHash: initial === null ? null : getContentHash(initial),
      },
    })
  }
  edits.forEach((edit, index) => {
    if (edit.type === 'create') {
      clientChanges.push({
        index,
        change: {
          type: 'file',
          path: edit.path,
          content: edit.content,
          expectedHash: null,
        },
      })
    } else if (edit.type === 'delete') {
      const initial = initialContentByPath.get(edit.path)
      if (typeof initial === 'string') {
        clientChanges.push({
          index,
          change: {
            type: 'delete',
            path: edit.path,
            expectedHash: getContentHash(initial),
          },
        })
      }
    } else if (edit.type === 'move') {
      const initial = initialContentByPath.get(edit.path)
      if (typeof initial === 'string') {
        clientChanges.push({
          index,
          change: {
            type: 'move',
            path: edit.path,
            destinationPath: edit.destinationPath,
            expectedHash: getContentHash(initial),
            destinationExpectedHash: null,
          },
        })
      }
    }
  })
  clientChanges.sort((a, b) => a.index - b.index)

  const appliedFiles: {
    path: string
    patch: string
    messages: string[]
  }[] = []
  const application = await coordinateEditApplication<'edit_transaction'>({
    toolName: 'edit_transaction',
    fileProcessingState,
    paths: uniquePaths,
    apply: () =>
      requestClientToolCall({
        toolCallId: toolCall.toolCallId,
        toolName: 'edit_transaction',
        input: clientChanges.map(({ change }) => change),
      }),
    onApplied: () => {
      for (const file of transactionResult.files) {
        if (freshWholeFileAuthorizationPaths.has(file.path)) {
          grantWholeFileReadAuthorization(
            fileProcessingState,
            file.path,
            file.content,
          )
        }
        const fileProcessingResult = Promise.resolve({
          tool: 'edit_transaction' as const,
          path: file.path,
          toolCallId: toolCall.toolCallId,
          content: file.content,
          patch: file.patch,
          messages: file.messages,
        })
        if (!fileProcessingState.promisesByPath[file.path]) {
          fileProcessingState.promisesByPath[file.path] = []
        }
        fileProcessingState.promisesByPath[file.path].push(fileProcessingResult)
        fileProcessingState.allPromises.push(fileProcessingResult)
        appliedFiles.push({
          path: file.path,
          patch: file.patch,
          messages: file.messages,
        })
      }
    },
  })

  if (application.status === 'threw') {
    return {
      output: [
        {
          type: 'json',
          value: {
            errorMessage: [
              'edit_transaction failed while applying its preflighted coordinated changes.',
              `Client threw: ${application.error instanceof Error ? application.error.message : String(application.error)}`,
              'No in-memory transaction state was recorded. Re-read all affected files before retrying.',
            ].join('\n'),
            failures: [
              {
                editIndex: -1,
                path: transactionResult.files
                  .map((file) => file.path)
                  .join(', '),
                errorMessage:
                  application.error instanceof Error
                    ? application.error.message
                    : String(application.error),
              },
            ],
          },
        },
      ],
    }
  }

  if (application.status === 'rejected') {
    return { output: application.output }
  }

  return { output: application.output }
}) satisfies CodebuffToolHandlerFunction<'edit_transaction'>
