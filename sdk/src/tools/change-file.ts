import path from 'path'

import {
  CHANGES,
  FileContentChangeSchema,
  MAX_TRANSACTION_FILE_BYTES,
  MAX_TRANSACTION_PREPARED_BYTES,
  MAX_TRANSACTION_ROLLBACK_BYTES,
  type FileChange,
  type FileContentChange,
} from '@codebuff/common/actions'
import { fileExists } from '@codebuff/common/util/file'
import {
  getContentHash,
  type ReadCapabilityIssuer,
} from '@codebuff/common/util/content-hash'
import {
  buildFileMutationResultFromReceiptV1,
  fileMutationResultV1Schema,
  type FilesystemError,
  type CommitReceiptV1,
} from '@codebuff/common/tools/results/filesystem'
import { applyPatch } from 'diff'

import { getDefaultFilesystemAuthority } from './apply-patch'
import {
  hashFileContent,
  type AuthorizedFilesystemPath,
} from './filesystem-authority'
import { resolveFilePathForFileSystemOperation } from './path-utils'
import { buildFreshWholeFileCapability } from './mutation-capabilities'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { ResolvedOperationPath } from './path-utils'
import type { FileFilter } from './read-files'
import type { FilesystemAuthorityPolicy } from './filesystem-authority'

type ApplyChangeResult =
  | {
      status: 'created' | 'modified'
      file: string
      operationId: string
      beforeHash: string | null
      afterHash: string
      authorityTier: 'portable_path' | 'conditional_commit'
      authorityReceipt: CommitReceiptV1
      finalContent: string
      canonicalPath: string
    }
  | {
      status: 'patchFailed'
      file: string
      patch: string
      error: FilesystemError
    }
  | { status: 'invalid'; file: string; error: FilesystemError }

export async function changeFile(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
  signal?: AbortSignal
  fileFilter?: FileFilter
  callId?: string
  filesystemPolicy?: FilesystemAuthorityPolicy
  capabilityIssuer?: ReadCapabilityIssuer
}): Promise<CodebuffToolOutput<'str_replace'>> {
  const {
    parameters,
    cwd,
    fs,
    signal,
    fileFilter,
    callId,
    filesystemPolicy,
    capabilityIssuer,
  } = params

  const fileChange = FileContentChangeSchema.parse(parameters)
  const resolvedPath = await resolveFilePathForFileSystemOperation(
    cwd,
    fileChange.path,
    fs,
  )
  if (!resolvedPath) {
    throw new Error('file path is outside the project directory')
  }

  const result = await applyChange({
    change: fileChange,
    resolvedPath,
    fs,
    cwd,
    signal,
    fileFilter,
    callId,
    filesystemPolicy,
  })

  if (result.status === 'created' || result.status === 'modified') {
    const action = result.status === 'created' ? 'create' : 'update'
    return [
      {
        type: 'json',
        value: fileMutationResultV1Schema.parse({
          kind: 'file_mutation_result',
          version: 1,
          operationId: result.operationId,
          outcome: 'applied',
          actions: [
            {
              actionId: `${result.operationId}:0`,
              index: 0,
              action,
              path: result.file,
              outcome: 'applied',
              beforeHash: result.beforeHash,
              afterHash: result.afterHash,
              afterContent: result.finalContent,
              ...(fileChange.type === 'patch'
                ? { patch: fileChange.content }
                : {}),
            },
          ],
          authorityTier: result.authorityTier,
          receiptId: result.authorityReceipt.receiptId,
          authorityReceipt: result.authorityReceipt,
          errors: [],
          freshCapabilities: capabilityIssuer
            ? [
                buildFreshWholeFileCapability({
                  canonicalPath: result.canonicalPath,
                  path: result.file,
                  content: result.finalContent,
                  capabilityIssuer,
                }),
              ]
            : [],
        }),
      },
    ]
  }

  const operationId = crypto.randomUUID()
  const error =
    'error' in result
      ? result.error
      : filesystemError('application_rejected', 'Mutation did not apply.')
  return [
    {
      type: 'json',
      value: fileMutationResultV1Schema.parse({
        kind: 'file_mutation_result',
        version: 1,
        operationId,
        outcome: 'not_applied',
        actions: [
          {
            actionId: `${operationId}:0`,
            index: 0,
            action: fileChange.expectedHash === null ? 'create' : 'update',
            path: fileChange.path,
            outcome: 'not_applied',
            beforeHash: null,
            afterHash: null,
            ...(result.status === 'patchFailed' ? { patch: result.patch } : {}),
            error,
          },
        ],
        authorityTier: null,
        errors: [error],
        freshCapabilities: [],
      }),
    },
  ]
}

export async function changeFiles(params: {
  parameters: unknown
  cwd: string
  fs: CodebuffFileSystem
  signal?: AbortSignal
  fileFilter?: FileFilter
  callId?: string
  filesystemPolicy?: FilesystemAuthorityPolicy
  capabilityIssuer?: ReadCapabilityIssuer
}): Promise<CodebuffToolOutput<'edit_transaction'>> {
  const {
    parameters,
    cwd,
    fs,
    signal,
    fileFilter,
    callId,
    filesystemPolicy,
    capabilityIssuer,
  } = params
  const parsedChanges = CHANGES.safeParse(parameters)
  if (!parsedChanges.success) {
    const resourceIssue = parsedChanges.error.issues.find((issue) =>
      /limit|at most|bounded|split/i.test(issue.message),
    )
    if (resourceIssue) {
      return standaloneTransactionFailureResult(
        filesystemError('resource_limit', resourceIssue.message, {
          retryable: true,
          recovery: 'split_transaction',
        }),
      )
    }
    throw parsedChanges.error
  }
  const changes = parsedChanges.data
  const authority = getDefaultFilesystemAuthority(
    cwd,
    fs,
    fileFilter,
    filesystemPolicy,
  )
  const operationId = crypto.randomUUID()
  const hasGuardedMutation = changes.some(
    (change) =>
      change.type === 'delete' ||
      change.type === 'move' ||
      change.expectedHash !== null,
  )
  const tier =
    hasGuardedMutation &&
    changes.every((change) =>
      change.type === 'delete'
        ? Boolean(fs.conditionalDelete)
        : change.type === 'move'
          ? Boolean(fs.conditionalMove)
          : change.expectedHash === null
            ? true
            : Boolean(fs.conditionalCommit),
    )
      ? ('conditional_commit' as const)
      : ('portable_path' as const)
  const authorized: Array<{
    change: FileChange
    source: Extract<
      Awaited<ReturnType<typeof authority.authorizePath>>,
      { allowed: true }
    >['path']
    destination?: Extract<
      Awaited<ReturnType<typeof authority.authorizePath>>,
      { allowed: true }
    >['path']
  }> = []
  for (const change of changes) {
    const sourceOperation =
      change.type === 'delete'
        ? 'delete'
        : change.type === 'move'
          ? 'move'
          : change.expectedHash === null
            ? 'create'
            : 'overwrite'
    const source = await authority.authorizePath(change.path, sourceOperation)
    if (!source.allowed) {
      return transactionFailureResult({
        authority,
        callId: callId ?? operationId,
        operationId,
        changes,
        authorityTier: tier,
        failedIndex: authorized.length,
        error: filesystemError(
          'outside_project',
          'Transaction path is outside the project or blocked by policy.',
        ),
      })
    }
    let destination: (typeof authorized)[number]['destination']
    if (change.type === 'move') {
      const result = await authority.authorizePath(
        change.destinationPath,
        'create',
      )
      if (!result.allowed) {
        return transactionFailureResult({
          authority,
          callId: callId ?? operationId,
          operationId,
          changes,
          authorityTier: tier,
          failedIndex: authorized.length,
          error: filesystemError(
            'outside_project',
            'Move destination is outside the project or blocked by policy.',
          ),
        })
      }
      destination = result.path
    }
    authorized.push({ change, source: source.path, destination })
  }

  const lockPaths = authorized.flatMap((entry) =>
    entry.destination ? [entry.source, entry.destination] : [entry.source],
  )
  authority.registerOperation({
    id: operationId,
    kind: changes.some((change) => change.type === 'move')
      ? 'move'
      : 'overwrite',
    paths: lockPaths,
  })

  return authority.withAuthorizedPathLocks(lockPaths, async () => {
    const preparedResults = await mapWithConcurrency(
      authorized,
      8,
      (entry, index) => prepareTransactionChange(entry, fs, index),
    )
    const prepared: PreparedTransactionChange[] = []
    for (const [index, result] of preparedResults.entries()) {
      if (!result.ok) {
        authority.cancel(operationId)
        return transactionFailureResult({
          authority,
          callId: callId ?? operationId,
          operationId,
          changes,
          authorityTier: tier,
          failedIndex: index,
          error: result.error,
        })
      }
      prepared.push(result.change)
    }
    const resourceFailure = validatePreparedTransactionResources(prepared)
    if (resourceFailure) {
      authority.cancel(operationId)
      return transactionFailureResult({
        authority,
        callId: callId ?? operationId,
        operationId,
        changes,
        authorityTier: tier,
        failedIndex: resourceFailure.index,
        error: resourceFailure.error,
      })
    }
    const unsupportedChange = prepared.find((change) =>
      change.action === 'create'
        ? !fs.createFileExclusive
        : change.action === 'delete'
          ? !fs.conditionalDelete
          : change.action === 'move'
            ? !fs.conditionalMove
            : !fs.conditionalCommit,
    )
    if (unsupportedChange) {
      authority.cancel(operationId)
      return transactionFailureResult({
        authority,
        callId: callId ?? operationId,
        operationId,
        changes,
        authorityTier: 'portable_path',
        failedIndex: unsupportedChange.index,
        error: filesystemError(
          'unsupported',
          `Guarded ${unsupportedChange.action} is unavailable because this filesystem adapter does not provide the required conditional primitive. No files were changed.`,
          { retryable: false },
        ),
      })
    }
    for (const entry of authorized) {
      const sourceOperation =
        entry.change.type === 'delete'
          ? 'delete'
          : entry.change.type === 'move'
            ? 'move'
            : entry.change.expectedHash === null
              ? 'create'
              : 'overwrite'
      if (
        !(await authority.authorizeCommit(entry.source, sourceOperation))
          .allowed
      ) {
        authority.cancel(operationId)
        return transactionFailureResult({
          authority,
          callId: callId ?? operationId,
          operationId,
          changes,
          authorityTier: tier,
          failedIndex: prepared.length,
          error: filesystemError(
            'blocked',
            'Transaction commit denied by policy.',
          ),
        })
      }
      if (
        entry.destination &&
        !(await authority.authorizeCommit(entry.destination, 'create')).allowed
      ) {
        authority.cancel(operationId)
        return transactionFailureResult({
          authority,
          callId: callId ?? operationId,
          operationId,
          changes,
          authorityTier: tier,
          failedIndex: prepared.length,
          error: filesystemError(
            'blocked',
            'Move destination commit denied by policy.',
          ),
        })
      }
    }
    if (signal?.aborted) {
      authority.cancel(operationId)
      return transactionFailureResult({
        authority,
        callId: callId ?? operationId,
        operationId,
        changes,
        authorityTier: tier,
        failedIndex: 0,
        error: filesystemError(
          'cancelled',
          'Transaction cancelled before commit.',
        ),
      })
    }
    for (const change of prepared) {
      const currentSource = await readOptionalText(
        fs,
        change.source.operationPath,
      )
      const sourceMatches =
        currentSource === change.beforeContent ||
        (currentSource !== null &&
          change.beforeContent !== null &&
          getContentHash(currentSource) ===
            getContentHash(change.beforeContent))
      const destinationMatches = change.destination
        ? (await readOptionalText(fs, change.destination.operationPath)) ===
          null
        : true
      if (!sourceMatches || !destinationMatches) {
        authority.cancel(operationId)
        return transactionFailureResult({
          authority,
          callId: callId ?? operationId,
          operationId,
          changes,
          authorityTier: tier,
          failedIndex: change.index,
          error: filesystemError(
            'stale_state',
            'Transaction state changed after preparation and before commit.',
          ),
        })
      }
    }
    const begun = authority.beginCommit(operationId)
    if (!begun.begun) {
      return transactionFailureResult({
        authority,
        callId: callId ?? operationId,
        operationId,
        changes,
        authorityTier: tier,
        failedIndex: 0,
        error: filesystemError(
          'application_rejected',
          'Transaction could not begin.',
        ),
      })
    }

    const committed: PreparedTransactionChange[] = []
    try {
      for (const change of prepared) {
        // Track the in-progress action before invoking the adapter. A failed
        // adapter call may have partially mutated state (notably a portable
        // move creates the destination before unlinking the source), so the
        // rollback set must include the current action as well as prior ones.
        committed.push(change)
        await commitPreparedTransactionChange(change, fs, authority)
      }
      const expectedFinalHashes = Object.fromEntries(
        prepared.flatMap((change) =>
          change.action === 'move'
            ? [
                [change.path, null],
                [
                  change.destinationPath!,
                  hashFileContent(change.afterContent!),
                ],
              ]
            : [
                [
                  change.path,
                  change.afterContent === null
                    ? null
                    : hashFileContent(change.afterContent),
                ],
              ],
        ),
      )
      const receipt = await authority.issueCommittedReceipt({
        operationId,
        callId: callId ?? operationId,
        authorityTier: tier,
        actions: prepared.map((change) => ({
          actionId: change.actionId,
          index: change.index,
          action: change.action,
          path: change.path,
          ...(change.destinationPath
            ? { destinationPath: change.destinationPath }
            : {}),
          beforeHash:
            change.beforeContent === null
              ? null
              : hashFileContent(change.beforeContent),
        })),
        expectedFinalHashes,
      })
      authority.finishCommit(begun.lease, { succeeded: true })
      return [
        {
          type: 'json',
          value: buildFileMutationResultFromReceiptV1(
            receipt,
            [],
            prepared.flatMap((change) => {
              if (change.afterContent === null || !capabilityIssuer) return []
              return [
                buildFreshWholeFileCapability({
                  canonicalPath:
                    change.destination?.canonicalPath ??
                    change.source.canonicalPath,
                  path: change.destinationPath ?? change.path,
                  content: change.afterContent,
                  capabilityIssuer,
                }),
              ]
            }),
            new Map<number | string, string>(
              prepared.flatMap((change) =>
                change.afterContent === null
                  ? []
                  : [[change.index, change.afterContent] as const],
              ),
            ),
          ),
        },
      ]
    } catch (error) {
      const commitError = filesystemError(
        'io_error',
        error instanceof Error ? error.message : String(error),
      )
      const rollbackFailures = new Map<number, FilesystemError>()
      const rollbackRestored = new Set<number>()
      for (const change of committed.toReversed()) {
        try {
          if (await rollbackPreparedTransactionChange(change, fs, authority)) {
            rollbackRestored.add(change.index)
          }
        } catch (rollbackError) {
          rollbackFailures.set(
            change.index,
            filesystemError(
              'rollback_incomplete',
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
              { retryable: false, recovery: 'inspect_rollback' },
            ),
          )
        }
      }
      authority.finishCommit(begun.lease, {
        succeeded: false,
        errorCode:
          rollbackFailures.size > 0 ? 'ROLLBACK_INCOMPLETE' : 'WRITE_FAILED',
      })
      const committedIndexes = new Set(committed.map((change) => change.index))
      const receipt = await authority.issueObservedFailureReceipt({
        operationId,
        callId: callId ?? operationId,
        authorityTier: tier,
        status:
          rollbackFailures.size > 0
            ? 'rollback_incomplete'
            : rollbackRestored.size > 0
              ? 'rolled_back'
              : 'failed',
        actions: prepared.map((change) => ({
          actionId: change.actionId,
          index: change.index,
          action: change.action,
          path: change.path,
          ...(change.destinationPath
            ? { destinationPath: change.destinationPath }
            : {}),
          status: !committedIndexes.has(change.index)
            ? ('not_started' as const)
            : rollbackFailures.has(change.index)
              ? ('rollback_failed' as const)
              : rollbackRestored.has(change.index)
                ? ('rolled_back' as const)
                : ('failed' as const),
          beforeHash:
            change.beforeContent === null
              ? null
              : hashFileContent(change.beforeContent),
          ...(rollbackFailures.has(change.index)
            ? {
                error: rollbackFailures.get(change.index),
              }
            : {}),
        })),
      })
      return [
        {
          type: 'json',
          value: buildFileMutationResultFromReceiptV1(receipt, [commitError]),
        },
      ]
    }
  })
}

type AuthorizedPath = AuthorizedFilesystemPath

type PreparedTransactionChange = {
  index: number
  actionId: string
  action: 'create' | 'update' | 'delete' | 'move'
  path: string
  destinationPath?: string
  source: AuthorizedPath
  destination?: AuthorizedPath
  beforeContent: string | null
  destinationBeforeContent?: string | null
  afterContent: string | null
  patch?: string
  beforeMode?: number
}

function filesystemError(
  code: FilesystemError['code'],
  message: string,
  options: Pick<
    FilesystemError,
    'retryable' | 'requiresFreshRead' | 'recovery'
  > = { retryable: false },
): FilesystemError {
  return { code, message, ...options }
}

async function readOptionalText(
  fs: CodebuffFileSystem,
  filePath: string,
): Promise<string | null> {
  if (!(await fileExists({ filePath, fs }))) return null
  const raw = await fs.readFile(filePath)
  if (typeof raw === 'string') return raw
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
    )
  } catch {
    throw new Error(
      `UNSUPPORTED_BINARY: ${filePath} is not valid UTF-8 text and cannot participate in a text transaction.`,
    )
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (next < values.length) {
        const index = next++
        results[index] = await mapper(values[index]!, index)
      }
    }),
  )
  return results
}

async function prepareTransactionChange(
  entry: {
    change: FileChange
    source: AuthorizedPath
    destination?: AuthorizedPath
  },
  fs: CodebuffFileSystem,
  index: number,
): Promise<
  | { ok: true; change: PreparedTransactionChange }
  | { ok: false; error: FilesystemError }
> {
  const beforeContent = await readOptionalText(fs, entry.source.operationPath)
  const beforeMode =
    beforeContent === null
      ? undefined
      : (await fs.stat(entry.source.operationPath)).mode
  const freshnessHash =
    beforeContent === null ? null : getContentHash(beforeContent)
  const expectedHash = entry.change.expectedHash
  if (expectedHash !== undefined && expectedHash !== freshnessHash) {
    return {
      ok: false,
      error: filesystemError(
        expectedHash === null ? 'already_exists' : 'stale_state',
        expectedHash === null
          ? `Create rejected for ${entry.source.portablePath}: the file already exists.`
          : `Mutation rejected for ${entry.source.portablePath}: the file changed after it was read.`,
      ),
    }
  }

  if (entry.change.type === 'delete') {
    if (beforeContent === null) {
      return {
        ok: false,
        error: filesystemError('not_found', 'Delete source does not exist.'),
      }
    }
    return {
      ok: true,
      change: {
        index,
        actionId: crypto.randomUUID(),
        action: 'delete',
        path: entry.source.portablePath,
        source: entry.source,
        beforeContent,
        ...(beforeMode !== undefined ? { beforeMode } : {}),
        afterContent: null,
      },
    }
  }

  if (entry.change.type === 'move') {
    if (beforeContent === null || !entry.destination) {
      return {
        ok: false,
        error: filesystemError('not_found', 'Move source does not exist.'),
      }
    }
    const destinationBeforeContent = await readOptionalText(
      fs,
      entry.destination.operationPath,
    )
    if (destinationBeforeContent !== null) {
      return {
        ok: false,
        error: filesystemError(
          'already_exists',
          'Move destination already exists.',
        ),
      }
    }
    return {
      ok: true,
      change: {
        index,
        actionId: crypto.randomUUID(),
        action: 'move',
        path: entry.source.portablePath,
        destinationPath: entry.destination.portablePath,
        source: entry.source,
        destination: entry.destination,
        beforeContent,
        ...(beforeMode !== undefined ? { beforeMode } : {}),
        destinationBeforeContent,
        afterContent: beforeContent,
      },
    }
  }

  if (entry.change.type === 'patch' && beforeContent === null) {
    return {
      ok: false,
      error: filesystemError('not_found', 'Patch target does not exist.'),
    }
  }
  const afterContent =
    entry.change.type === 'file'
      ? entry.change.content
      : applyPatch(beforeContent ?? '', entry.change.content)
  if (afterContent === false) {
    return {
      ok: false,
      error: filesystemError('application_rejected', 'Patch did not apply.'),
    }
  }
  return {
    ok: true,
    change: {
      index,
      actionId: crypto.randomUUID(),
      action: beforeContent === null ? 'create' : 'update',
      path: entry.source.portablePath,
      source: entry.source,
      beforeContent,
      ...(beforeMode !== undefined ? { beforeMode } : {}),
      afterContent,
      ...(entry.change.type === 'patch' ? { patch: entry.change.content } : {}),
    },
  }
}

async function commitPreparedTransactionChange(
  change: PreparedTransactionChange,
  fs: CodebuffFileSystem,
  authority: ReturnType<typeof getDefaultFilesystemAuthority>,
): Promise<void> {
  if (change.action === 'delete') {
    const expectedHash = hashFileContent(change.beforeContent!)
    const deleted = await authority.conditionalDelete(
      change.source,
      expectedHash,
    )
    if (deleted.supported) {
      if (!deleted.result.applied) {
        throw new Error(
          `STALE_STATE: ${change.path} changed immediately before deletion.`,
        )
      }
    } else throw new Error('Conditional delete is unsupported')
    return
  }
  if (change.action === 'move') {
    await fs.mkdir(path.dirname(change.destination!.operationPath), {
      recursive: true,
    })
    const moved = await authority.conditionalMove(
      change.source,
      change.destination!,
      hashFileContent(change.beforeContent!),
    )
    if (!moved.supported) throw new Error('Conditional move is unsupported')
    if (!moved.result.applied) {
      throw new Error(
        `STALE_STATE: ${change.path} or ${change.destinationPath} changed immediately before move.`,
      )
    }
    return
  }
  await fs.mkdir(path.dirname(change.source.operationPath), { recursive: true })
  if (change.action === 'create') {
    const created = await authority.createExclusive(
      change.source,
      change.afterContent!,
    )
    if (!created.supported) throw new Error('Exclusive create is unsupported')
    return
  }
  const expectedHash = hashFileContent(change.beforeContent!)
  const committed = await authority.conditionalCommit(
    change.source,
    change.afterContent!,
    { state: 'present', hash: expectedHash },
  )
  if (committed.supported) {
    if (!committed.result.applied) {
      throw new Error(
        `STALE_STATE: ${change.path} changed immediately before commit.`,
      )
    }
    return
  }
  throw new Error('Conditional commit is unsupported')
}

async function rollbackPreparedTransactionChange(
  change: PreparedTransactionChange,
  fs: CodebuffFileSystem,
  authority: ReturnType<typeof getDefaultFilesystemAuthority>,
): Promise<boolean> {
  if (change.action === 'delete') {
    const current = await authority.snapshot(change.source)
    if (
      current.state === 'present' &&
      current.hash === hashFileContent(change.beforeContent!)
    ) {
      return false
    }
    await fs.mkdir(path.dirname(change.source.operationPath), {
      recursive: true,
    })
    const restored = await authority.createExclusive(
      change.source,
      change.beforeContent!,
    )
    if (!restored.supported) {
      throw new Error('Exclusive rollback recreation is unsupported')
    }
    if (change.beforeMode !== undefined && fs.setMode) {
      await fs.setMode(change.source.operationPath, change.beforeMode)
    }
    return true
  }
  if (change.action === 'move') {
    const [sourceState, destinationState] = await Promise.all([
      authority.snapshot(change.source),
      authority.snapshot(change.destination!),
    ])
    if (
      sourceState.state === 'present' &&
      sourceState.hash === hashFileContent(change.beforeContent!) &&
      destinationState.state === 'absent'
    ) {
      return false
    }
    const restored = await authority.conditionalMove(
      change.destination!,
      change.source,
      hashFileContent(change.afterContent!),
    )
    if (!restored.supported) {
      throw new Error('Conditional rollback move is unsupported')
    }
    if (!restored.result.applied) {
      throw new Error(
        'Rollback conflict: moved paths no longer match transaction-owned state',
      )
    }
    return true
  }
  if (change.beforeContent === null) {
    const current = await authority.snapshot(change.source)
    if (current.state === 'absent') return false
    const removed = await authority.conditionalDelete(
      change.source,
      hashFileContent(change.afterContent!),
    )
    if (!removed.supported) {
      throw new Error('Conditional rollback delete is unsupported')
    }
    if (!removed.result.applied) {
      throw new Error(
        'Rollback conflict: created file no longer matches transaction-owned state',
      )
    }
    return true
  } else {
    const current = await authority.snapshot(change.source)
    if (
      current.state === 'present' &&
      current.hash === hashFileContent(change.beforeContent)
    ) {
      return false
    }
    const restored = await authority.conditionalCommit(
      change.source,
      change.beforeContent,
      { state: 'present', hash: hashFileContent(change.afterContent!) },
    )
    if (!restored.supported) {
      throw new Error('Conditional rollback commit is unsupported')
    }
    if (!restored.result.applied) {
      throw new Error(
        'Rollback conflict: updated file no longer matches transaction-owned state',
      )
    }
    return true
  }
}

function validatePreparedTransactionResources(
  prepared: readonly PreparedTransactionChange[],
): { index: number; error: FilesystemError } | null {
  let preparedBytes = 0
  let rollbackBytes = 0
  for (const change of prepared) {
    const beforeBytes =
      change.beforeContent === null
        ? 0
        : Buffer.byteLength(change.beforeContent)
    const afterBytes =
      change.afterContent === null ? 0 : Buffer.byteLength(change.afterContent)
    if (
      beforeBytes > MAX_TRANSACTION_FILE_BYTES ||
      afterBytes > MAX_TRANSACTION_FILE_BYTES
    ) {
      return {
        index: change.index,
        error: filesystemError(
          'resource_limit',
          `Transaction file ${change.path} exceeds the ${MAX_TRANSACTION_FILE_BYTES}-byte per-file limit. Split the work or use a bounded range edit.`,
          { retryable: true, recovery: 'split_transaction' },
        ),
      }
    }
    preparedBytes += beforeBytes + afterBytes
    rollbackBytes += beforeBytes
    if (preparedBytes > MAX_TRANSACTION_PREPARED_BYTES) {
      return {
        index: change.index,
        error: filesystemError(
          'resource_limit',
          `Prepared transaction state exceeds the ${MAX_TRANSACTION_PREPARED_BYTES}-byte limit. Split the transaction into bounded groups.`,
          { retryable: true, recovery: 'split_transaction' },
        ),
      }
    }
    if (rollbackBytes > MAX_TRANSACTION_ROLLBACK_BYTES) {
      return {
        index: change.index,
        error: filesystemError(
          'resource_limit',
          `Transaction rollback state exceeds the ${MAX_TRANSACTION_ROLLBACK_BYTES}-byte limit. Split the transaction into bounded groups.`,
          { retryable: true, recovery: 'split_transaction' },
        ),
      }
    }
  }
  return null
}

function standaloneTransactionFailureResult(
  error: FilesystemError,
): CodebuffToolOutput<'edit_transaction'> {
  return [
    {
      type: 'json',
      value: fileMutationResultV1Schema.parse({
        kind: 'file_mutation_result',
        version: 1,
        operationId: crypto.randomUUID(),
        outcome: 'not_applied',
        actions: [],
        authorityTier: null,
        errors: [error],
        freshCapabilities: [],
      }),
    },
  ]
}

function transactionFailureResult(params: {
  authority: ReturnType<typeof getDefaultFilesystemAuthority>
  callId: string
  operationId: string
  changes: FileChange[]
  authorityTier: 'portable_path' | 'conditional_commit'
  failedIndex: number
  error: FilesystemError
}): CodebuffToolOutput<'edit_transaction'> {
  const receipt = params.authority.issueNotStartedReceipt({
    operationId: params.operationId,
    callId: params.callId,
    authorityTier: params.authorityTier,
    actions: params.changes.map((change, index) => ({
      actionId: `${params.operationId}:${index}`,
      index,
      action:
        change.type === 'delete' || change.type === 'move'
          ? change.type
          : change.expectedHash === null
            ? 'create'
            : 'update',
      path: change.path,
      ...(change.type === 'move'
        ? { destinationPath: change.destinationPath }
        : {}),
      beforeHash: null,
      ...(index === params.failedIndex ? { error: params.error } : {}),
    })),
  })
  return [
    {
      type: 'json',
      value: fileMutationResultV1Schema.parse({
        kind: 'file_mutation_result',
        version: 1,
        operationId: params.operationId,
        outcome: 'not_applied',
        actions: params.changes.map((change, index) => ({
          actionId: `${params.operationId}:${index}`,
          index,
          action:
            change.type === 'delete' || change.type === 'move'
              ? change.type
              : change.expectedHash === null
                ? 'create'
                : 'update',
          path: change.path,
          ...(change.type === 'move'
            ? { destinationPath: change.destinationPath }
            : {}),
          outcome: 'not_applied',
          beforeHash: null,
          afterHash: null,
          ...(index === params.failedIndex ? { error: params.error } : {}),
        })),
        authorityTier: params.authorityTier,
        receiptId: receipt.receiptId,
        authorityReceipt: receipt,
        errors: [params.error],
        freshCapabilities: [],
      }),
    },
  ]
}

async function applyChange(params: {
  change: FileContentChange
  resolvedPath: ResolvedOperationPath
  fs: CodebuffFileSystem
  cwd: string
  signal?: AbortSignal
  fileFilter?: FileFilter
  callId?: string
  filesystemPolicy?: FilesystemAuthorityPolicy
}): Promise<ApplyChangeResult> {
  const {
    change,
    resolvedPath,
    fs,
    cwd,
    signal,
    fileFilter,
    callId,
    filesystemPolicy,
  } = params
  const { content, type } = change
  const { operationPath: fullPath, relativePath } = resolvedPath
  const authority = getDefaultFilesystemAuthority(
    cwd,
    fs,
    fileFilter,
    filesystemPolicy,
  )
  const authorization = await authority.authorizePath(
    change.path,
    change.expectedHash === null ? 'create' : 'overwrite',
  )
  if (!authorization.allowed) {
    return {
      status: 'invalid',
      file: relativePath,
      error: filesystemError(
        'blocked',
        `Mutation denied for ${relativePath}: ${authorization.code}.`,
      ),
    }
  }
  const operationId = crypto.randomUUID()
  authority.registerOperation({
    id: operationId,
    kind: change.expectedHash === null ? 'create' : 'overwrite',
    paths: [authorization.path],
  })

  try {
    return await authority.withAuthorizedPathLocks(
      [authorization.path],
      async () => {
        const initialSnapshot = await authority.snapshot(authorization.path)
        if (initialSnapshot.state === 'unavailable') {
          throw new MutationApplicationError(
            filesystemError(
              'io_error',
              `Could not read ${relativePath}: ${initialSnapshot.code}.`,
              { retryable: true, recovery: 'retry' },
            ),
          )
        }
        const exists = initialSnapshot.state === 'present'
        const oldContent = exists ? await fs.readFile(fullPath, 'utf-8') : null
        const beforeHash =
          initialSnapshot.state === 'present' ? initialSnapshot.hash : null
        const freshnessHash =
          oldContent === null ? null : getContentHash(oldContent)
        if (
          change.expectedHash !== undefined &&
          change.expectedHash !== freshnessHash
        ) {
          throw new MutationApplicationError(
            filesystemError(
              change.expectedHash === null ? 'already_exists' : 'stale_state',
              change.expectedHash === null
                ? `Create rejected for ${relativePath}: the file already exists.`
                : `Update rejected for ${relativePath}: the file changed after it was read.`,
              change.expectedHash === null
                ? { retryable: false, recovery: 'choose_new_path' }
                : {
                    retryable: true,
                    requiresFreshRead: true,
                    recovery: 'read_again',
                  },
            ),
          )
        }
        if (type === 'patch' && oldContent === null) {
          return {
            status: 'patchFailed',
            file: relativePath,
            patch: content,
            error: filesystemError(
              'not_found',
              `Patch target ${relativePath} does not exist.`,
              { retryable: true, recovery: 'discover_path' },
            ),
          }
        }

        const newContent =
          type === 'file' ? content : applyPatch(oldContent ?? '', content)
        if (newContent === false) {
          return {
            status: 'patchFailed',
            file: relativePath,
            patch: content,
            error: filesystemError(
              'application_rejected',
              `Patch context did not match ${relativePath}.`,
              {
                retryable: true,
                requiresFreshRead: true,
                recovery: 'read_again',
              },
            ),
          }
        }
        const commitAuthorization = await authority.authorizeCommit(
          authorization.path,
          exists ? 'overwrite' : 'create',
        )
        if (!commitAuthorization.allowed) {
          throw new Error(`Commit denied: ${commitAuthorization.code}`)
        }
        if (signal?.aborted) {
          authority.cancel(operationId)
          throw signal.reason instanceof Error
            ? signal.reason
            : new Error('Mutation cancelled before commit')
        }
        const begun = authority.beginCommit(operationId)
        if (!begun.begun) {
          throw new Error(`Mutation could not begin: ${begun.state}`)
        }
        try {
          if (!exists) {
            await fs.mkdir(path.dirname(fullPath), { recursive: true })
            const created = await authority.createExclusive(
              commitAuthorization.path,
              newContent,
            )
            if (!created.supported) {
              throw new Error('Exclusive create is unsupported')
            }
          } else {
            const committed = await authority.conditionalCommit(
              commitAuthorization.path,
              newContent,
              { state: 'present', hash: beforeHash! },
            )
            if (committed.supported) {
              if (!committed.result.applied) {
                throw new MutationApplicationError(
                  filesystemError(
                    'stale_state',
                    `Update rejected for ${relativePath}: the file changed immediately before commit.`,
                    {
                      retryable: true,
                      requiresFreshRead: true,
                      recovery: 'read_again',
                    },
                  ),
                )
              }
            } else {
              throw new MutationApplicationError(
                filesystemError(
                  'unsupported',
                  `Update rejected for ${relativePath}: this filesystem adapter does not provide conditional commit. No files were changed.`,
                  { retryable: false },
                ),
              )
            }
          }
        } catch (error) {
          authority.finishCommit(begun.lease, {
            succeeded: false,
            errorCode:
              error instanceof Error
                ? error.name.toUpperCase()
                : 'WRITE_FAILED',
          })
          throw error
        }

        const expectedFinalHash = hashFileContent(newContent)
        const authorityTier =
          exists && fs.conditionalCommit
            ? ('conditional_commit' as const)
            : ('portable_path' as const)
        const authorityReceipt = await authority.issueCommittedReceipt({
          operationId,
          callId: callId ?? operationId,
          authorityTier,
          actions: [
            {
              actionId: `${operationId}:0`,
              index: 0,
              action: exists ? 'update' : 'create',
              path: relativePath,
              beforeHash,
            },
          ],
          expectedFinalHashes: { [relativePath]: expectedFinalHash },
        })
        authority.finishCommit(begun.lease, { succeeded: true })
        const afterHash = authorityReceipt.actions[0]!.afterHash!
        return {
          status: exists ? 'modified' : 'created',
          file: relativePath,
          operationId,
          beforeHash,
          afterHash,
          authorityTier,
          authorityReceipt,
          finalContent: newContent,
          canonicalPath: commitAuthorization.path.canonicalPath,
        }
      },
    )
  } catch (error) {
    const filesystemFailure =
      error instanceof MutationApplicationError
        ? error.filesystemError
        : filesystemError(
            signal?.aborted ? 'cancelled' : 'io_error',
            signal?.aborted
              ? `Mutation cancelled for ${relativePath}.`
              : `Mutation failed for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
            signal?.aborted
              ? { retryable: true, recovery: 'retry' }
              : { retryable: true, recovery: 'retry' },
          )
    console.error('File mutation failed', {
      path: relativePath,
      type,
      byteLength: Buffer.byteLength(content),
      code: filesystemFailure.code,
    })
    return { status: 'invalid', file: relativePath, error: filesystemFailure }
  }
}

class MutationApplicationError extends Error {
  constructor(readonly filesystemError: FilesystemError) {
    super(filesystemError.message)
    this.name = 'MutationApplicationError'
  }
}
