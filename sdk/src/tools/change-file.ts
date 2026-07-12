import path from 'path'

import {
  CHANGES,
  FileContentChangeSchema,
  type FileChange,
  type FileContentChange,
} from '@codebuff/common/actions'
import { fileExists } from '@codebuff/common/util/file'
import { getContentHash } from '@codebuff/common/util/content-hash'
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
}): Promise<CodebuffToolOutput<'str_replace'>> {
  const { parameters, cwd, fs, signal, fileFilter, callId, filesystemPolicy } =
    params

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
              ...(fileChange.type === 'patch'
                ? { patch: fileChange.content }
                : {}),
            },
          ],
          authorityTier: result.authorityTier,
          receiptId: result.authorityReceipt.receiptId,
          authorityReceipt: result.authorityReceipt,
          errors: [],
          freshCapabilities: [
            buildFreshWholeFileCapability(
              result.canonicalPath,
              result.finalContent,
            ),
          ],
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
}): Promise<CodebuffToolOutput<'edit_transaction'>> {
  const { parameters, cwd, fs, signal, fileFilter, callId, filesystemPolicy } =
    params
  const changes = CHANGES.parse(parameters)
  const authority = getDefaultFilesystemAuthority(
    cwd,
    fs,
    fileFilter,
    filesystemPolicy,
  )
  const operationId = crypto.randomUUID()
  const tier = changes.every((change) =>
    change.type === 'delete'
      ? Boolean(fs.conditionalDelete)
      : change.type === 'move'
        ? false
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
              : getContentHash(change.beforeContent),
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
              if (change.afterContent === null) return []
              return [
                buildFreshWholeFileCapability(
                  change.destination?.canonicalPath ??
                    change.source.canonicalPath,
                  change.afterContent,
                ),
              ]
            }),
          ),
        },
      ]
    } catch (error) {
      const commitError = filesystemError(
        'io_error',
        error instanceof Error ? error.message : String(error),
      )
      const rollbackFailed = new Set<number>()
      for (const change of committed.toReversed()) {
        try {
          await rollbackPreparedTransactionChange(change, fs)
        } catch {
          rollbackFailed.add(change.index)
        }
      }
      authority.finishCommit(begun.lease, {
        succeeded: false,
        errorCode:
          rollbackFailed.size > 0 ? 'ROLLBACK_INCOMPLETE' : 'WRITE_FAILED',
      })
      const committedIndexes = new Set(committed.map((change) => change.index))
      const receipt = await authority.issueObservedFailureReceipt({
        operationId,
        callId: callId ?? operationId,
        authorityTier: tier,
        status: rollbackFailed.size > 0 ? 'rollback_incomplete' : 'rolled_back',
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
            : rollbackFailed.has(change.index)
              ? ('rollback_failed' as const)
              : ('rolled_back' as const),
          beforeHash:
            change.beforeContent === null
              ? null
              : getContentHash(change.beforeContent),
          ...(rollbackFailed.has(change.index)
            ? {
                error: filesystemError(
                  'rollback_incomplete',
                  'Rollback failed for this action.',
                ),
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
  usedNativeMove?: boolean
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
  const beforeHash =
    beforeContent === null ? null : getContentHash(beforeContent)
  const expectedHash = entry.change.expectedHash
  if (expectedHash !== undefined && expectedHash !== beforeHash) {
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
    const expectedHash = getContentHash(change.beforeContent!)
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
    } else {
      await fs.unlink(change.source.operationPath)
    }
    return
  }
  if (change.action === 'move') {
    await fs.mkdir(path.dirname(change.destination!.operationPath), {
      recursive: true,
    })
    if (fs.renameFile) {
      await fs.renameFile(
        change.source.operationPath,
        change.destination!.operationPath,
      )
      change.usedNativeMove = true
      return
    }
    const created = await authority.createExclusive(
      change.destination!,
      change.afterContent!,
    )
    if (!created.supported) throw new Error('Exclusive move is unsupported')
    if (change.beforeMode !== undefined && fs.setMode) {
      await fs.setMode(change.destination!.operationPath, change.beforeMode)
    }
    await fs.unlink(change.source.operationPath)
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
  const expectedHash = getContentHash(change.beforeContent!)
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
  await fs.writeFile(change.source.operationPath, change.afterContent!)
}

async function rollbackPreparedTransactionChange(
  change: PreparedTransactionChange,
  fs: CodebuffFileSystem,
): Promise<void> {
  if (change.action === 'delete') {
    await fs.mkdir(path.dirname(change.source.operationPath), {
      recursive: true,
    })
    await fs.writeFile(change.source.operationPath, change.beforeContent!)
    if (change.beforeMode !== undefined && fs.setMode) {
      await fs.setMode(change.source.operationPath, change.beforeMode)
    }
    return
  }
  if (change.action === 'move') {
    if (change.usedNativeMove && fs.renameFile) {
      await fs.renameFile(
        change.destination!.operationPath,
        change.source.operationPath,
      )
      return
    }
    await fs.mkdir(path.dirname(change.source.operationPath), {
      recursive: true,
    })
    await fs.writeFile(change.source.operationPath, change.beforeContent!)
    if (change.beforeMode !== undefined && fs.setMode) {
      await fs.setMode(change.source.operationPath, change.beforeMode)
    }
    if (await fileExists({ filePath: change.destination!.operationPath, fs })) {
      await fs.unlink(change.destination!.operationPath)
    }
    return
  }
  if (change.beforeContent === null) {
    if (await fileExists({ filePath: change.source.operationPath, fs })) {
      await fs.unlink(change.source.operationPath)
    }
  } else {
    await fs.writeFile(change.source.operationPath, change.beforeContent)
  }
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
          oldContent === null ? null : getContentHash(oldContent)
        if (
          change.expectedHash !== undefined &&
          change.expectedHash !== beforeHash
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
              await fs.writeFile(fullPath, newContent)
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
