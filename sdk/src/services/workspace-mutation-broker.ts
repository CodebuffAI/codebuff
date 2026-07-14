import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveWorkspaceIdentity } from './repository-identity'

import type {
  CodebuffConditionalCommitResult,
  CodebuffConditionalDeleteResult,
  CodebuffConditionalMoveResult,
  CodebuffFileContent,
} from '@codebuff/common/types/filesystem'
import type { PathLike } from 'node:fs'

const DEFAULT_LOCK_TIMEOUT_MS = 10_000
const DEFAULT_STALE_LOCK_MS = 120_000
const DEFAULT_LOCK_POLL_MS = 20

export const WORKSPACE_MUTATION_AUTHORITY = 'cooperative_cas' as const

type BrokerAction = 'commit' | 'create' | 'delete' | 'move'
type FinalReceiptState =
  | 'committed'
  | 'rejected'
  | 'failed'
  | 'recovered_committed'
  | 'recovered_not_applied'

type PendingReceiptState = 'prepared' | 'recovery_required'

export type WorkspaceMutationReceipt = {
  schemaVersion: 1
  receiptId: string
  brokerRevision: number
  authorityKind: typeof WORKSPACE_MUTATION_AUTHORITY
  repositoryId: string
  workspaceId: string
  action: BrokerAction
  path: string
  destinationPath?: string
  expectedHash: string | null
  expectedDestinationHash?: null
  beforeHash: string | null
  afterHash: string | null
  state: FinalReceiptState | PendingReceiptState
  createdAt: string
  updatedAt: string
  stagingPath?: string
  errorCode?: string
}

export type WorkspaceMutationReceiptReference = Pick<
  WorkspaceMutationReceipt,
  'receiptId' | 'brokerRevision' | 'authorityKind'
>

export type WorkspaceMutationCommitResult = CodebuffConditionalCommitResult & {
  receipt: WorkspaceMutationReceiptReference
}

export type WorkspaceMutationDeleteResult = CodebuffConditionalDeleteResult & {
  receipt: WorkspaceMutationReceiptReference
}

export type WorkspaceMutationMoveResult = CodebuffConditionalMoveResult & {
  receipt: WorkspaceMutationReceiptReference
}

export type WorkspaceMutationBrokerOptions = {
  cwd: string
  stateDir: string
  lockTimeoutMs?: number
  staleLockMs?: number
  lockPollMs?: number
}

type BrokerState = {
  schemaVersion: 1
  revision: number
  updatedAt: string
}

type LockOwner = {
  schemaVersion: 1
  token: string
  pid: number
  acquiredAt: string
}

function fallbackIdentity(cwd: string): {
  repositoryId: string
  workspaceId: string
} {
  const canonical = path.resolve(cwd)
  const digest = createHash('sha256')
    .update(canonical)
    .digest('hex')
    .slice(0, 24)
  return { repositoryId: digest, workspaceId: digest }
}

function exactHash(content: Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function toBytes(content: CodebuffFileContent): Uint8Array {
  if (typeof content === 'string') return Buffer.from(content)
  return new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
}

function errorCode(error: unknown): string {
  return error instanceof Error && 'code' in error
    ? String((error as NodeJS.ErrnoException).code ?? error.name)
    : error instanceof Error
      ? error.name
      : 'UNKNOWN'
}

function pathLikeToString(value: PathLike): string {
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return value.toString()
  return fileURLToPath(value)
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function receiptReference(
  receipt: WorkspaceMutationReceipt,
): WorkspaceMutationReceiptReference {
  return {
    receiptId: receipt.receiptId,
    brokerRevision: receipt.brokerRevision,
    authorityKind: receipt.authorityKind,
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export class WorkspaceMutationBrokerRecoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceMutationBrokerRecoveryError'
  }
}

/**
 * Cooperative local compare-and-swap authority for participating Openbuff
 * processes. It does not provide kernel-enforced exclusion against arbitrary
 * external editors; workspace watchers and revision checks remain the
 * external-mutation backstop.
 */
export class WorkspaceMutationBroker {
  readonly authorityKind = WORKSPACE_MUTATION_AUTHORITY
  readonly repositoryId: string
  readonly workspaceId: string
  readonly workspaceRoot: string
  readonly brokerDir: string

  private readonly pendingDir: string
  private readonly receiptsDir: string
  private readonly statePath: string
  private readonly lockPath: string
  private readonly lockTimeoutMs: number
  private readonly staleLockMs: number
  private readonly lockPollMs: number

  private constructor(params: {
    workspaceRoot: string
    stateDir: string
    repositoryId: string
    workspaceId: string
    lockTimeoutMs: number
    staleLockMs: number
    lockPollMs: number
  }) {
    this.workspaceRoot = params.workspaceRoot
    this.repositoryId = params.repositoryId
    this.workspaceId = params.workspaceId
    this.brokerDir = path.join(
      path.resolve(params.stateDir),
      params.repositoryId,
      'mutation-brokers',
      params.workspaceId,
    )
    this.pendingDir = path.join(this.brokerDir, 'pending')
    this.receiptsDir = path.join(this.brokerDir, 'receipts')
    this.statePath = path.join(this.brokerDir, 'state.json')
    this.lockPath = `${this.brokerDir}.lock`
    this.lockTimeoutMs = params.lockTimeoutMs
    this.staleLockMs = params.staleLockMs
    this.lockPollMs = params.lockPollMs
  }

  static async create(
    options: WorkspaceMutationBrokerOptions,
  ): Promise<WorkspaceMutationBroker> {
    const resolvedRoot = path.resolve(options.cwd)
    const workspaceRoot = await fs
      .realpath(resolvedRoot)
      .catch(() => resolvedRoot)
    const resolvedStateDir = path.resolve(options.stateDir)
    const stateDir = await fs
      .realpath(resolvedStateDir)
      .catch(() => resolvedStateDir)
    if (isWithin(workspaceRoot, stateDir)) {
      throw new Error(
        'Workspace mutation broker state must be stored outside the workspace.',
      )
    }
    const identity = await resolveWorkspaceIdentity({
      cwd: workspaceRoot,
    }).catch(() => fallbackIdentity(workspaceRoot))
    const broker = new WorkspaceMutationBroker({
      workspaceRoot,
      stateDir,
      repositoryId: identity.repositoryId,
      workspaceId: identity.workspaceId,
      lockTimeoutMs: options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
      staleLockMs: options.staleLockMs ?? DEFAULT_STALE_LOCK_MS,
      lockPollMs: options.lockPollMs ?? DEFAULT_LOCK_POLL_MS,
    })
    await broker.initialize()
    return broker
  }

  async conditionalCommit(
    filePath: PathLike,
    data: CodebuffFileContent,
    expectedHash: string | null,
  ): Promise<WorkspaceMutationCommitResult> {
    const target = await this.resolvePath(filePath)
    const bytes = toBytes(data)
    const afterHash = exactHash(bytes)
    return this.withWorkspaceLock(async () => {
      await this.requireRecoveredWorkspace()
      const beforeHash = await this.readHash(target.absolutePath)
      const receipt = await this.prepareReceipt({
        action: expectedHash === null ? 'create' : 'commit',
        path: target.relativePath,
        expectedHash,
        beforeHash,
        afterHash,
        stagingPath: this.stagingRelativePath(target.absolutePath, 'tmp'),
      })
      if (beforeHash !== expectedHash) {
        const rejected = await this.finalizeReceipt(receipt, 'rejected')
        return {
          applied: false,
          actualHash: beforeHash,
          receipt: receiptReference(rejected),
        }
      }

      let mutationVisible = false
      try {
        const stagingPath = this.absoluteFromRelative(receipt.stagingPath!)
        const mode =
          expectedHash === null
            ? 0o600
            : (await fs.stat(target.absolutePath)).mode & 0o777
        await this.writeStagedFile(stagingPath, bytes, mode)
        if (expectedHash === null) {
          try {
            await fs.link(stagingPath, target.absolutePath)
          } catch (error) {
            if (errorCode(error) === 'EEXIST') {
              await this.removeIfExists(stagingPath)
              const actualHash = await this.readHash(target.absolutePath)
              const rejected = await this.finalizeReceipt(receipt, 'rejected')
              return {
                applied: false,
                actualHash,
                receipt: receiptReference(rejected),
              }
            }
            throw error
          }
          mutationVisible = true
          await this.fsyncDirectory(path.dirname(target.absolutePath))
          await this.removeIfExists(stagingPath)
          await this.fsyncDirectory(path.dirname(stagingPath))
        } else {
          await fs.rename(stagingPath, target.absolutePath)
          mutationVisible = true
          await this.fsyncDirectory(path.dirname(target.absolutePath))
        }
        const committedHash = await this.readHash(target.absolutePath)
        if (committedHash !== afterHash) {
          const unresolved = await this.updatePendingReceipt(receipt, {
            state: 'recovery_required',
            errorCode: 'POST_COMMIT_HASH_MISMATCH',
          })
          throw new WorkspaceMutationBrokerRecoveryError(
            `Mutation ${unresolved.receiptId} committed an unexpected workspace state.`,
          )
        }
        const committed = await this.finalizeReceipt(receipt, 'committed')
        return { applied: true, receipt: receiptReference(committed) }
      } catch (error) {
        if (error instanceof WorkspaceMutationBrokerRecoveryError) throw error
        if (mutationVisible) {
          await this.updatePendingReceipt(receipt, {
            state: 'recovery_required',
            errorCode: errorCode(error),
          })
          throw new WorkspaceMutationBrokerRecoveryError(
            `Mutation ${receipt.receiptId} requires recovery after a partial commit.`,
          )
        }
        await this.removeIfExists(
          this.absoluteFromRelative(receipt.stagingPath!),
        ).catch(() => undefined)
        const failed = await this.finalizeReceipt(
          receipt,
          'failed',
          errorCode(error),
        )
        throw Object.assign(
          new Error(
            `Workspace mutation ${failed.receiptId} failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
          { cause: error },
        )
      }
    })
  }

  async createExclusive(
    filePath: PathLike,
    data: CodebuffFileContent,
  ): Promise<WorkspaceMutationCommitResult> {
    return this.conditionalCommit(filePath, data, null)
  }

  async conditionalDelete(
    filePath: PathLike,
    expectedHash: string,
  ): Promise<WorkspaceMutationDeleteResult> {
    const target = await this.resolvePath(filePath)
    return this.withWorkspaceLock(async () => {
      await this.requireRecoveredWorkspace()
      const beforeHash = await this.readHash(target.absolutePath)
      const receipt = await this.prepareReceipt({
        action: 'delete',
        path: target.relativePath,
        expectedHash,
        beforeHash,
        afterHash: null,
        stagingPath: this.stagingRelativePath(target.absolutePath, 'delete'),
      })
      if (beforeHash !== expectedHash) {
        const rejected = await this.finalizeReceipt(receipt, 'rejected')
        return {
          applied: false,
          actualHash: beforeHash,
          receipt: receiptReference(rejected),
        }
      }

      const tombstonePath = this.absoluteFromRelative(receipt.stagingPath!)
      let mutationVisible = false
      try {
        await fs.rename(target.absolutePath, tombstonePath)
        mutationVisible = true
        await this.fsyncDirectory(path.dirname(target.absolutePath))
        const tombstoneHash = await this.readHash(tombstonePath)
        if (tombstoneHash !== expectedHash) {
          await this.updatePendingReceipt(receipt, {
            state: 'recovery_required',
            errorCode: 'DELETE_TOMBSTONE_HASH_MISMATCH',
          })
          throw new WorkspaceMutationBrokerRecoveryError(
            `Delete ${receipt.receiptId} moved unexpected bytes and requires recovery.`,
          )
        }
        await fs.unlink(tombstonePath)
        await this.fsyncDirectory(path.dirname(tombstonePath))
        const committed = await this.finalizeReceipt(receipt, 'committed')
        return { applied: true, receipt: receiptReference(committed) }
      } catch (error) {
        if (error instanceof WorkspaceMutationBrokerRecoveryError) throw error
        if (mutationVisible) {
          await this.updatePendingReceipt(receipt, {
            state: 'recovery_required',
            errorCode: errorCode(error),
          })
          throw new WorkspaceMutationBrokerRecoveryError(
            `Delete ${receipt.receiptId} requires recovery after a partial mutation.`,
          )
        }
        const failed = await this.finalizeReceipt(
          receipt,
          'failed',
          errorCode(error),
        )
        throw Object.assign(
          new Error(
            `Workspace delete ${failed.receiptId} failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
          { cause: error },
        )
      }
    })
  }

  async conditionalMove(
    sourcePath: PathLike,
    destinationPath: PathLike,
    expectedSourceHash: string,
  ): Promise<WorkspaceMutationMoveResult> {
    const source = await this.resolvePath(sourcePath)
    const destination = await this.resolvePath(destinationPath)
    if (source.absolutePath === destination.absolutePath) {
      throw new Error(
        'Workspace mutation move source and destination must differ.',
      )
    }
    return this.withWorkspaceLock(async () => {
      await this.requireRecoveredWorkspace()
      const [actualSourceHash, actualDestinationHash] = await Promise.all([
        this.readHash(source.absolutePath),
        this.readHash(destination.absolutePath),
      ])
      const receipt = await this.prepareReceipt({
        action: 'move',
        path: source.relativePath,
        destinationPath: destination.relativePath,
        expectedHash: expectedSourceHash,
        expectedDestinationHash: null,
        beforeHash: actualSourceHash,
        afterHash: expectedSourceHash,
      })
      if (
        actualSourceHash !== expectedSourceHash ||
        actualDestinationHash !== null
      ) {
        const rejected = await this.finalizeReceipt(receipt, 'rejected')
        return {
          applied: false,
          actualSourceHash,
          actualDestinationHash,
          receipt: receiptReference(rejected),
        }
      }

      let destinationLinked = false
      try {
        await fs.link(source.absolutePath, destination.absolutePath)
        destinationLinked = true
        await this.fsyncDirectory(path.dirname(destination.absolutePath))
        await fs.unlink(source.absolutePath)
        await this.fsyncDirectory(path.dirname(source.absolutePath))
        const committed = await this.finalizeReceipt(receipt, 'committed')
        return { applied: true, receipt: receiptReference(committed) }
      } catch (error) {
        if (errorCode(error) === 'EEXIST' && !destinationLinked) {
          const currentDestinationHash = await this.readHash(
            destination.absolutePath,
          )
          const rejected = await this.finalizeReceipt(receipt, 'rejected')
          return {
            applied: false,
            actualSourceHash: await this.readHash(source.absolutePath),
            actualDestinationHash: currentDestinationHash,
            receipt: receiptReference(rejected),
          }
        }
        if (destinationLinked) {
          const [currentSourceHash, currentDestinationHash] = await Promise.all(
            [
              this.readHash(source.absolutePath),
              this.readHash(destination.absolutePath),
            ],
          )
          if (
            currentSourceHash === expectedSourceHash &&
            currentDestinationHash === expectedSourceHash
          ) {
            await this.removeIfExists(destination.absolutePath)
            await this.fsyncDirectory(path.dirname(destination.absolutePath))
          } else {
            await this.updatePendingReceipt(receipt, {
              state: 'recovery_required',
              errorCode: errorCode(error),
            })
            throw new WorkspaceMutationBrokerRecoveryError(
              `Move ${receipt.receiptId} requires recovery after a partial mutation.`,
            )
          }
        }
        const failed = await this.finalizeReceipt(
          receipt,
          'failed',
          errorCode(error),
        )
        throw Object.assign(
          new Error(
            `Workspace move ${failed.receiptId} failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
          { cause: error },
        )
      }
    })
  }

  async listReceipts(): Promise<WorkspaceMutationReceipt[]> {
    await fs.mkdir(this.receiptsDir, { recursive: true, mode: 0o700 })
    const names = (await fs.readdir(this.receiptsDir))
      .filter((name) => name.endsWith('.json'))
      .sort()
    const receipts: WorkspaceMutationReceipt[] = []
    for (const name of names) {
      receipts.push(
        await this.readJson<WorkspaceMutationReceipt>(
          path.join(this.receiptsDir, name),
        ),
      )
    }
    return receipts
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(this.pendingDir, { recursive: true, mode: 0o700 })
    await fs.mkdir(this.receiptsDir, { recursive: true, mode: 0o700 })
    await this.withWorkspaceLock(async () => {
      if (!(await this.exists(this.statePath))) {
        await this.writeJsonDurable(this.statePath, {
          schemaVersion: 1,
          revision: 0,
          updatedAt: new Date().toISOString(),
        } satisfies BrokerState)
      }
      await this.requireRecoveredWorkspace()
    })
  }

  private async withWorkspaceLock<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquireWorkspaceLock()
    try {
      return await operation()
    } finally {
      await release()
    }
  }

  private async acquireWorkspaceLock(): Promise<() => Promise<void>> {
    await fs.mkdir(path.dirname(this.lockPath), {
      recursive: true,
      mode: 0o700,
    })
    const startedAt = Date.now()
    const owner: LockOwner = {
      schemaVersion: 1,
      token: randomUUID(),
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    }
    while (true) {
      try {
        await fs.mkdir(this.lockPath, { mode: 0o700 })
        await this.writeJsonDurable(
          path.join(this.lockPath, 'owner.json'),
          owner,
        )
        await this.fsyncDirectory(this.lockPath)
        break
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error
        if (await this.canRecoverLock()) {
          await fs.rm(this.lockPath, { recursive: true, force: true })
          continue
        }
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new Error(
            `Timed out acquiring workspace mutation lock '${this.lockPath}'.`,
          )
        }
        await sleep(this.lockPollMs)
      }
    }

    return async () => {
      try {
        const current = await this.readJson<LockOwner>(
          path.join(this.lockPath, 'owner.json'),
        )
        if (current.token === owner.token) {
          await fs.rm(this.lockPath, { recursive: true, force: true })
          await this.fsyncDirectory(path.dirname(this.lockPath))
        }
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error
      }
    }
  }

  private async canRecoverLock(): Promise<boolean> {
    let age: number
    try {
      age = Date.now() - (await fs.stat(this.lockPath)).mtimeMs
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return true
      throw error
    }
    if (age <= this.staleLockMs) return false
    try {
      const owner = await this.readJson<LockOwner>(
        path.join(this.lockPath, 'owner.json'),
      )
      return !this.isProcessAlive(owner.pid)
    } catch (error) {
      return errorCode(error) === 'ENOENT' || error instanceof SyntaxError
    }
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return errorCode(error) === 'EPERM'
    }
  }

  private async requireRecoveredWorkspace(): Promise<void> {
    const unresolved = await this.recoverPendingReceipts()
    if (unresolved.length > 0) {
      throw new WorkspaceMutationBrokerRecoveryError(
        `Workspace mutation recovery is required for receipt(s): ${unresolved.join(', ')}.`,
      )
    }
  }

  private async recoverPendingReceipts(): Promise<string[]> {
    const names = (await fs.readdir(this.pendingDir))
      .filter((name) => name.endsWith('.json'))
      .sort()
    const unresolved: string[] = []
    for (const name of names) {
      const pendingPath = path.join(this.pendingDir, name)
      const receipt = await this.readJson<WorkspaceMutationReceipt>(pendingPath)
      const finalPath = path.join(this.receiptsDir, name)
      if (await this.exists(finalPath)) {
        await fs.unlink(pendingPath)
        continue
      }
      const recovered = await this.recoverReceipt(receipt)
      if (!recovered) unresolved.push(receipt.receiptId)
    }
    return unresolved
  }

  private async recoverReceipt(
    receipt: WorkspaceMutationReceipt,
  ): Promise<boolean> {
    const target = this.absoluteFromRelative(receipt.path)
    if (receipt.action === 'delete') {
      const tombstone = receipt.stagingPath
        ? this.absoluteFromRelative(receipt.stagingPath)
        : undefined
      if (
        tombstone &&
        (await this.readHash(tombstone)) === receipt.expectedHash
      ) {
        await fs.unlink(tombstone)
        await this.fsyncDirectory(path.dirname(tombstone))
        await this.finalizeReceipt(receipt, 'recovered_committed')
        return true
      }
      const current = await this.readHash(target)
      if (current === null) {
        await this.finalizeReceipt(receipt, 'recovered_committed')
        return true
      }
      if (current === receipt.expectedHash) {
        await this.finalizeReceipt(receipt, 'recovered_not_applied')
        return true
      }
      await this.updatePendingReceipt(receipt, {
        state: 'recovery_required',
        errorCode: 'AMBIGUOUS_DELETE_STATE',
      })
      return false
    }

    if (receipt.action === 'move') {
      const destination = this.absoluteFromRelative(receipt.destinationPath!)
      const [sourceHash, destinationHash] = await Promise.all([
        this.readHash(target),
        this.readHash(destination),
      ])
      if (sourceHash === null && destinationHash === receipt.afterHash) {
        await this.finalizeReceipt(receipt, 'recovered_committed')
        return true
      }
      if (
        sourceHash === receipt.expectedHash &&
        destinationHash === receipt.afterHash &&
        (await this.pathsShareFileIdentity(target, destination))
      ) {
        await fs.unlink(target)
        await this.fsyncDirectory(path.dirname(target))
        await this.finalizeReceipt(receipt, 'recovered_committed')
        return true
      }
      if (sourceHash === receipt.expectedHash && destinationHash === null) {
        await this.finalizeReceipt(receipt, 'recovered_not_applied')
        return true
      }
      await this.updatePendingReceipt(receipt, {
        state: 'recovery_required',
        errorCode: 'AMBIGUOUS_MOVE_STATE',
      })
      return false
    }

    const current = await this.readHash(target)
    const staging = receipt.stagingPath
      ? this.absoluteFromRelative(receipt.stagingPath)
      : undefined
    if (current === receipt.afterHash) {
      if (staging) await this.removeIfExists(staging)
      await this.finalizeReceipt(receipt, 'recovered_committed')
      return true
    }
    if (current === receipt.expectedHash) {
      if (staging) await this.removeIfExists(staging)
      await this.finalizeReceipt(receipt, 'recovered_not_applied')
      return true
    }
    await this.updatePendingReceipt(receipt, {
      state: 'recovery_required',
      errorCode: 'AMBIGUOUS_COMMIT_STATE',
    })
    return false
  }

  private async prepareReceipt(
    values: Omit<
      WorkspaceMutationReceipt,
      | 'schemaVersion'
      | 'receiptId'
      | 'brokerRevision'
      | 'authorityKind'
      | 'repositoryId'
      | 'workspaceId'
      | 'state'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<WorkspaceMutationReceipt> {
    const state = await this.readJson<BrokerState>(this.statePath)
    const now = new Date().toISOString()
    const revision = state.revision + 1
    await this.writeJsonDurable(this.statePath, {
      schemaVersion: 1,
      revision,
      updatedAt: now,
    } satisfies BrokerState)
    const receipt: WorkspaceMutationReceipt = {
      schemaVersion: 1,
      receiptId: randomUUID(),
      brokerRevision: revision,
      authorityKind: WORKSPACE_MUTATION_AUTHORITY,
      repositoryId: this.repositoryId,
      workspaceId: this.workspaceId,
      state: 'prepared',
      createdAt: now,
      updatedAt: now,
      ...values,
    }
    await this.writeJsonDurable(this.pendingReceiptPath(receipt), receipt)
    return receipt
  }

  private async updatePendingReceipt(
    receipt: WorkspaceMutationReceipt,
    update: Pick<WorkspaceMutationReceipt, 'state'> &
      Partial<Pick<WorkspaceMutationReceipt, 'errorCode'>>,
  ): Promise<WorkspaceMutationReceipt> {
    const updated = {
      ...receipt,
      ...update,
      updatedAt: new Date().toISOString(),
    }
    await this.writeJsonDurable(this.pendingReceiptPath(updated), updated)
    return updated
  }

  private async finalizeReceipt(
    receipt: WorkspaceMutationReceipt,
    state: FinalReceiptState,
    failureCode?: string,
  ): Promise<WorkspaceMutationReceipt> {
    const finalized: WorkspaceMutationReceipt = {
      ...receipt,
      state,
      updatedAt: new Date().toISOString(),
      ...(failureCode ? { errorCode: failureCode } : {}),
    }
    const pendingPath = this.pendingReceiptPath(receipt)
    const finalPath = this.finalReceiptPath(receipt)
    await this.writeJsonDurable(finalPath, finalized)
    await this.removeIfExists(pendingPath)
    await this.fsyncDirectory(this.pendingDir)
    return finalized
  }

  private receiptFileName(receipt: WorkspaceMutationReceipt): string {
    return `${String(receipt.brokerRevision).padStart(16, '0')}-${receipt.receiptId}.json`
  }

  private pendingReceiptPath(receipt: WorkspaceMutationReceipt): string {
    return path.join(this.pendingDir, this.receiptFileName(receipt))
  }

  private finalReceiptPath(receipt: WorkspaceMutationReceipt): string {
    return path.join(this.receiptsDir, this.receiptFileName(receipt))
  }

  private async resolvePath(value: PathLike): Promise<{
    absolutePath: string
    relativePath: string
  }> {
    const raw = pathLikeToString(value)
    const absolutePath = path.resolve(this.workspaceRoot, raw)
    if (
      !isWithin(this.workspaceRoot, absolutePath) ||
      absolutePath === this.workspaceRoot
    ) {
      throw new Error(
        `Workspace mutation path is outside the broker root: ${raw}`,
      )
    }
    const parent = path.dirname(absolutePath)
    const canonicalParent = await fs.realpath(parent)
    if (!isWithin(this.workspaceRoot, canonicalParent)) {
      throw new Error(
        `Workspace mutation parent escapes the broker root: ${raw}`,
      )
    }
    return {
      absolutePath,
      relativePath: this.relativeFromAbsolute(absolutePath),
    }
  }

  private relativeFromAbsolute(absolutePath: string): string {
    return path
      .relative(this.workspaceRoot, absolutePath)
      .split(path.sep)
      .join('/')
  }

  private absoluteFromRelative(relativePath: string): string {
    const absolute = path.resolve(this.workspaceRoot, relativePath)
    if (
      !isWithin(this.workspaceRoot, absolute) ||
      absolute === this.workspaceRoot
    ) {
      throw new WorkspaceMutationBrokerRecoveryError(
        `Invalid broker receipt path '${relativePath}'.`,
      )
    }
    return absolute
  }

  private stagingRelativePath(target: string, suffix: string): string {
    return this.relativeFromAbsolute(
      path.join(
        path.dirname(target),
        `.openbuff-mutation-${process.pid}-${randomUUID()}.${suffix}`,
      ),
    )
  }

  private async readHash(filePath: string): Promise<string | null> {
    try {
      return exactHash(await fs.readFile(filePath))
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null
      throw error
    }
  }

  private async pathsShareFileIdentity(
    firstPath: string,
    secondPath: string,
  ): Promise<boolean> {
    try {
      const [first, second] = await Promise.all([
        fs.stat(firstPath),
        fs.stat(secondPath),
      ])
      return first.dev === second.dev && first.ino === second.ino
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return false
      throw error
    }
  }

  private async writeStagedFile(
    filePath: string,
    bytes: Uint8Array,
    mode: number,
  ): Promise<void> {
    const handle = await fs.open(filePath, 'wx', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.chmod(mode)
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  private async writeJsonDurable(
    filePath: string,
    value: unknown,
  ): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
    const tempPath = `${filePath}.tmp.${process.pid}.${randomUUID()}`
    const handle = await fs.open(tempPath, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await fs.rename(tempPath, filePath)
      await this.fsyncDirectory(path.dirname(filePath))
    } catch (error) {
      await this.removeIfExists(tempPath).catch(() => undefined)
      throw error
    }
  }

  private async fsyncDirectory(directory: string): Promise<void> {
    let handle
    try {
      handle = await fs.open(directory, 'r')
      await handle.sync()
    } catch (error) {
      const code = errorCode(error)
      if (
        process.platform === 'win32' &&
        ['EACCES', 'EBADF', 'EINVAL', 'ENOTSUP', 'EPERM'].includes(code)
      ) {
        return
      }
      throw error
    } finally {
      await handle?.close()
    }
  }

  private async readJson<T>(filePath: string): Promise<T> {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath)
      return true
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return false
      throw error
    }
  }

  private async removeIfExists(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
    }
  }
}
