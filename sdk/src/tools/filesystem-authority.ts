import { createHash } from 'node:crypto'
import path from 'node:path'

import {
  commitReceiptV1Schema,
  type CommitActionReceiptV1,
  type CommitReceiptV1,
} from '@codebuff/common/tools/results/filesystem'

import type {
  CodebuffConditionalCommitResult,
  CodebuffConditionalDeleteResult,
  CodebuffConditionalMoveResult,
  CodebuffFileContent,
  CodebuffFileSystem,
} from '@codebuff/common/types/filesystem'

import {
  isSafeProjectRelativePath,
  resolveFilePathForFileSystemOperation,
  type ResolvedOperationPath,
} from './path-utils'

export const MAX_COMMIT_RECEIPTS_PER_RUN = 1000
const MAX_REGISTERED_OPERATIONS_PER_RUN = 1000

export type FilesystemCapability =
  | 'baseline'
  | 'range_read'
  | 'text_range_read'
  | 'conditional_commit'
  | 'conditional_delete'
  | 'conditional_move'
  | 'exclusive_create'

export type FilesystemCapabilitySnapshot = Readonly<{
  tier: 'baseline' | 'enhanced' | 'cooperative' | 'atomic'
  capabilities: ReadonlySet<FilesystemCapability>
}>

export type FilesystemOperationKind =
  | 'read'
  | 'create'
  | 'overwrite'
  | 'delete'
  | 'move'

export type FilesystemPolicyPhase = 'resolve' | 'commit'

export type FilesystemPolicyContext = Readonly<{
  operation: FilesystemOperationKind
  phase: FilesystemPolicyPhase
  portablePath: string
  canonicalPath: string
  canonicalParentPath: string
}>

export type FilesystemPolicyDecision = Readonly<{
  allowed: boolean
  code?: string
  redactPath?: boolean
}>

export type FilesystemAuthorityPolicy = Readonly<{
  name: string
  evaluate: (
    context: FilesystemPolicyContext,
  ) => FilesystemPolicyDecision | Promise<FilesystemPolicyDecision>
}>

export function composeFilesystemPolicies(
  ...policies: readonly FilesystemAuthorityPolicy[]
): FilesystemAuthorityPolicy {
  if (policies.length === 0) {
    throw new Error('FilesystemAuthority requires at least one policy')
  }
  return {
    name: policies.map((policy) => policy.name).join('+'),
    async evaluate(context) {
      let redactPath = false
      for (const policy of policies) {
        const decision = await policy.evaluate(context)
        redactPath ||= decision.redactPath === true
        if (!decision.allowed) return { ...decision, redactPath }
      }
      return { allowed: true, redactPath }
    },
  }
}

export const allowAllFilesystemPolicy: FilesystemAuthorityPolicy = {
  name: 'allow-all',
  evaluate: () => ({ allowed: true }),
}

export type AuthorizedFilesystemPath = Readonly<{
  lexicalPath: string
  canonicalPath: string
  canonicalParentPath: string
  portablePath: string
  operationPath: string
  redactPath: boolean
}>

export type PathAuthorizationResult =
  | { allowed: true; path: AuthorizedFilesystemPath }
  | { allowed: false; code: string }

export type OptionalCapabilityResult<T> =
  | { supported: true; result: T }
  | { supported: false; reason: 'unsupported' }

export type FileSnapshot =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'present'; hash: string; byteLength: number }>
  | Readonly<{ state: 'unavailable'; code: string }>

export type ExpectedFileState =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'present'; hash: string }>

export type ExpectedStateValidation = Readonly<{
  matches: boolean
  actual: FileSnapshot
}>

export type CommitLeaseState =
  | 'open'
  | 'committing'
  | 'committed'
  | 'failed'
  | 'cancelled'

export type RegisteredFilesystemOperation = Readonly<{
  id: string
  kind: FilesystemOperationKind
  state: CommitLeaseState
  portablePaths: readonly string[]
}>

export type CommitLease = Readonly<{
  operationId: string
  token: number
}>

export type CommitReceipt = Readonly<{
  operationId: string
  outcome: 'committed' | 'failed' | 'cancelled'
  paths: readonly Readonly<{
    label: string
    fingerprint: string
  }>[]
  error?: Readonly<{ code: string }>
}>

type MutableOperation = {
  id: string
  kind: FilesystemOperationKind
  state: CommitLeaseState
  paths: readonly AuthorizedFilesystemPath[]
  leaseToken?: number
}

type LockEntry = {
  tail: Promise<void>
  users: number
}

export class FilesystemAuthority {
  readonly capabilities: FilesystemCapabilitySnapshot

  private readonly operations = new Map<string, MutableOperation>()
  private readonly receipts: CommitReceipt[] = []
  private readonly canonicalReceipts: CommitReceiptV1[] = []
  private readonly locks = new Map<string, LockEntry>()
  private nextLeaseToken = 1

  constructor(
    readonly projectRoot: string,
    readonly fileSystem: CodebuffFileSystem,
    readonly policy: FilesystemAuthorityPolicy,
  ) {
    if (!policy) throw new Error('FilesystemAuthority requires a policy')
    this.capabilities = detectFilesystemCapabilities(fileSystem)
  }

  async authorizePath(
    input: string,
    operation: FilesystemOperationKind,
    phase: FilesystemPolicyPhase = 'resolve',
  ): Promise<PathAuthorizationResult> {
    if (!isSafeProjectRelativePath(input)) {
      return { allowed: false, code: 'path_outside_project' }
    }
    const followFinalSymlink = operation !== 'create' && operation !== 'delete'
    const resolved = await resolveFilePathForFileSystemOperation(
      this.projectRoot,
      input,
      this.fileSystem,
      { followFinalSymlink },
    )
    if (!resolved) return { allowed: false, code: 'path_outside_project' }

    return this.toAuthorizedPath(resolved, operation, phase)
  }

  registerOperation(input: {
    id: string
    kind: FilesystemOperationKind
    paths: readonly AuthorizedFilesystemPath[]
  }): RegisteredFilesystemOperation {
    if (this.operations.has(input.id)) {
      throw new Error(`Filesystem operation already registered: ${input.id}`)
    }
    const operation: MutableOperation = {
      id: input.id,
      kind: input.kind,
      state: 'open',
      paths: [...input.paths],
    }
    this.operations.set(input.id, operation)
    this.pruneTerminalOperations()
    return this.publicOperation(operation)
  }

  async authorizeCommit(
    authorizedPath: AuthorizedFilesystemPath,
    operation: FilesystemOperationKind,
  ): Promise<PathAuthorizationResult> {
    const decision = await this.policy.evaluate({
      operation,
      phase: 'commit',
      portablePath: authorizedPath.portablePath,
      canonicalPath: authorizedPath.canonicalPath,
      canonicalParentPath: authorizedPath.canonicalParentPath,
    })
    if (!decision.allowed) {
      return { allowed: false, code: decision.code ?? 'policy_denied' }
    }
    return {
      allowed: true,
      path: {
        ...authorizedPath,
        redactPath: authorizedPath.redactPath || decision.redactPath === true,
      },
    }
  }

  getOperation(id: string): RegisteredFilesystemOperation | undefined {
    const operation = this.operations.get(id)
    return operation ? this.publicOperation(operation) : undefined
  }

  beginCommit(
    id: string,
  ):
    | { begun: true; lease: CommitLease }
    | { begun: false; state: CommitLeaseState | 'missing' } {
    const operation = this.operations.get(id)
    if (!operation) return { begun: false, state: 'missing' }
    if (operation.state !== 'open') {
      return { begun: false, state: operation.state }
    }
    const token = this.nextLeaseToken++
    operation.state = 'committing'
    operation.leaseToken = token
    return { begun: true, lease: { operationId: id, token } }
  }

  cancel(
    id: string,
  ):
    | { cancelled: true }
    | { cancelled: false; state: CommitLeaseState | 'missing' } {
    const operation = this.operations.get(id)
    if (!operation) return { cancelled: false, state: 'missing' }
    if (operation.state !== 'open') {
      return { cancelled: false, state: operation.state }
    }
    operation.state = 'cancelled'
    this.retainReceipt(this.makeReceipt(operation, 'cancelled'))
    return { cancelled: true }
  }

  finishCommit(
    lease: CommitLease,
    result: { succeeded: true } | { succeeded: false; errorCode: string },
  ):
    | { finished: true; state: 'committed' | 'failed' }
    | { finished: false; state: CommitLeaseState | 'missing' } {
    const operation = this.operations.get(lease.operationId)
    if (!operation) return { finished: false, state: 'missing' }
    if (
      operation.state !== 'committing' ||
      operation.leaseToken !== lease.token
    ) {
      return { finished: false, state: operation.state }
    }
    operation.state = result.succeeded ? 'committed' : 'failed'
    const outcome = operation.state
    this.retainReceipt(
      this.makeReceipt(
        operation,
        outcome,
        result.succeeded ? undefined : result.errorCode,
      ),
    )
    return { finished: true, state: outcome }
  }

  listReceipts(): readonly CommitReceipt[] {
    return [...this.receipts]
  }

  async issueCommittedReceipt(input: {
    operationId: string
    callId: string
    authorityTier: CommitReceiptV1['authorityTier']
    actions: readonly Omit<CommitActionReceiptV1, 'status' | 'afterHash'>[]
    expectedFinalHashes: Readonly<Record<string, string | null>>
  }): Promise<CommitReceiptV1> {
    const operation = this.operations.get(input.operationId)
    if (
      !operation ||
      (operation.state !== 'committing' && operation.state !== 'committed')
    ) {
      throw new Error(
        'Cannot verify a committed receipt for an inactive operation',
      )
    }
    const finalHashes: Record<string, string | null> = {}
    for (const [portablePath, expectedHash] of Object.entries(
      input.expectedFinalHashes,
    )) {
      const authorized = operation.paths.find(
        (candidate) => candidate.portablePath === portablePath,
      )
      if (!authorized) throw new Error('Receipt path was not authorized')
      const snapshot = await this.snapshot(authorized)
      const actualHash = snapshot.state === 'present' ? snapshot.hash : null
      if (actualHash !== expectedHash) {
        throw new Error('Post-commit authority verification failed')
      }
      finalHashes[portablePath] = actualHash
    }
    const receipt = commitReceiptV1Schema.parse({
      kind: 'commit_receipt',
      version: 1,
      receiptId: crypto.randomUUID(),
      operationId: input.operationId,
      callId: input.callId,
      authorityTier: input.authorityTier,
      status: 'committed',
      actions: input.actions.map((action) => ({
        ...action,
        status: 'committed' as const,
        afterHash:
          action.action === 'delete' || action.action === 'move'
            ? null
            : (finalHashes[action.path] ?? null),
      })),
      finalHashes,
    })
    this.canonicalReceipts.push(receipt)
    if (this.canonicalReceipts.length > MAX_COMMIT_RECEIPTS_PER_RUN) {
      this.canonicalReceipts.splice(
        0,
        this.canonicalReceipts.length - MAX_COMMIT_RECEIPTS_PER_RUN,
      )
    }
    return receipt
  }

  issueNotStartedReceipt(input: {
    operationId: string
    callId: string
    authorityTier: CommitReceiptV1['authorityTier']
    actions: readonly Omit<CommitActionReceiptV1, 'status' | 'afterHash'>[]
  }): CommitReceiptV1 {
    const receipt = commitReceiptV1Schema.parse({
      kind: 'commit_receipt',
      version: 1,
      receiptId: crypto.randomUUID(),
      operationId: input.operationId,
      callId: input.callId,
      authorityTier: input.authorityTier,
      status: 'not_started',
      actions: input.actions.map((action) => ({
        ...action,
        status: 'failed' as const,
        afterHash: null,
      })),
      finalHashes: {},
    })
    this.canonicalReceipts.push(receipt)
    if (this.canonicalReceipts.length > MAX_COMMIT_RECEIPTS_PER_RUN) {
      this.canonicalReceipts.shift()
    }
    return receipt
  }

  async issueObservedFailureReceipt(input: {
    operationId: string
    callId: string
    authorityTier: CommitReceiptV1['authorityTier']
    status: 'rolled_back' | 'rollback_incomplete' | 'failed'
    actions: readonly Omit<CommitActionReceiptV1, 'afterHash'>[]
  }): Promise<CommitReceiptV1> {
    const operation = this.operations.get(input.operationId)
    if (!operation || operation.state !== 'failed') {
      throw new Error('Cannot issue a failure receipt for an active operation')
    }
    const finalHashes: Record<string, string | null> = {}
    for (const authorized of operation.paths) {
      const snapshot = await this.snapshot(authorized)
      finalHashes[authorized.portablePath] =
        snapshot.state === 'present' ? snapshot.hash : null
    }
    const receipt = commitReceiptV1Schema.parse({
      kind: 'commit_receipt',
      version: 1,
      receiptId: crypto.randomUUID(),
      operationId: input.operationId,
      callId: input.callId,
      authorityTier: input.authorityTier,
      status: input.status,
      actions: input.actions.map((action) => ({
        ...action,
        afterHash:
          action.action === 'move'
            ? (finalHashes[action.destinationPath ?? action.path] ?? null)
            : (finalHashes[action.path] ?? null),
      })),
      finalHashes,
    })
    this.canonicalReceipts.push(receipt)
    if (this.canonicalReceipts.length > MAX_COMMIT_RECEIPTS_PER_RUN) {
      this.canonicalReceipts.shift()
    }
    return receipt
  }

  getCanonicalReceipt(operationId: string): CommitReceiptV1 | undefined {
    return this.canonicalReceipts.findLast(
      (receipt) => receipt.operationId === operationId,
    )
  }

  async withPathLocks<T>(
    canonicalPaths: readonly string[],
    action: () => Promise<T>,
  ): Promise<T> {
    const keys = [...new Set(canonicalPaths)].sort(compareCanonicalPaths)
    const releases: Array<() => void> = []
    try {
      for (const key of keys) releases.push(await this.acquireLock(key))
      return await action()
    } finally {
      for (const release of releases.reverse()) release()
    }
  }

  async withAuthorizedPathLocks<T>(
    paths: readonly AuthorizedFilesystemPath[],
    action: () => Promise<T>,
  ): Promise<T> {
    return this.withPathLocks(
      paths.map((item) => item.operationPath),
      action,
    )
  }

  async snapshot(
    authorizedPath: AuthorizedFilesystemPath,
  ): Promise<FileSnapshot> {
    try {
      const data = await this.fileSystem.readFile(authorizedPath.operationPath)
      const bytes = toBytes(data)
      return {
        state: 'present',
        hash: hashFileContent(bytes),
        byteLength: bytes.byteLength,
      }
    } catch (error) {
      const code = errorCode(error)
      return code === 'ENOENT'
        ? { state: 'absent' }
        : { state: 'unavailable', code }
    }
  }

  async revalidateExpectedState(
    authorizedPath: AuthorizedFilesystemPath,
    expected: ExpectedFileState,
  ): Promise<ExpectedStateValidation> {
    // This closes stale-read mistakes inside an authority flow. It does not
    // close an external check/write race; adapters must expose a native or
    // cooperative conditionalCommit authority for guarded writes.
    const actual = await this.snapshot(authorizedPath)
    return { matches: expectedStateMatches(expected, actual), actual }
  }

  async createExclusive(
    authorizedPath: AuthorizedFilesystemPath,
    data: CodebuffFileContent,
  ): Promise<
    { supported: true } | { supported: false; reason: 'unsupported' }
  > {
    const create = this.fileSystem.createFileExclusive
    if (!create) return { supported: false, reason: 'unsupported' }
    await create.call(this.fileSystem, authorizedPath.operationPath, data)
    return { supported: true }
  }

  async readRange(
    authorizedPath: AuthorizedFilesystemPath,
    start: number,
    endExclusive: number,
  ): Promise<OptionalCapabilityResult<Uint8Array>> {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(endExclusive) ||
      start < 0 ||
      endExclusive < start
    ) {
      throw new RangeError('Invalid byte range')
    }
    const read = this.fileSystem.readRange
    if (!read) return { supported: false, reason: 'unsupported' }
    const value = await read.call(
      this.fileSystem,
      authorizedPath.operationPath,
      start,
      endExclusive,
    )
    return { supported: true, result: value.data }
  }

  async conditionalCommit(
    authorizedPath: AuthorizedFilesystemPath,
    data: CodebuffFileContent,
    expected: ExpectedFileState,
  ): Promise<OptionalCapabilityResult<CodebuffConditionalCommitResult>> {
    const commit = this.fileSystem.conditionalCommit
    if (!commit) return { supported: false, reason: 'unsupported' }
    const result = await commit.call(
      this.fileSystem,
      authorizedPath.operationPath,
      data,
      { expectedHash: expected.state === 'absent' ? null : expected.hash },
    )
    return { supported: true, result }
  }

  async conditionalDelete(
    authorizedPath: AuthorizedFilesystemPath,
    expectedHash: string,
  ): Promise<OptionalCapabilityResult<CodebuffConditionalDeleteResult>> {
    const remove = this.fileSystem.conditionalDelete
    if (!remove) return { supported: false, reason: 'unsupported' }
    const result = await remove.call(
      this.fileSystem,
      authorizedPath.operationPath,
      {
        expectedHash,
      },
    )
    return { supported: true, result }
  }

  async conditionalMove(
    source: AuthorizedFilesystemPath,
    destination: AuthorizedFilesystemPath,
    expectedSourceHash: string,
  ): Promise<OptionalCapabilityResult<CodebuffConditionalMoveResult>> {
    const move = this.fileSystem.conditionalMove
    if (!move) return { supported: false, reason: 'unsupported' }
    const result = await move.call(
      this.fileSystem,
      source.operationPath,
      destination.operationPath,
      { expectedSourceHash, expectedDestinationHash: null },
    )
    return { supported: true, result }
  }

  private async toAuthorizedPath(
    resolved: ResolvedOperationPath,
    operation: FilesystemOperationKind,
    phase: FilesystemPolicyPhase,
  ): Promise<PathAuthorizationResult> {
    const portablePath = toPortablePath(resolved.relativePath)
    const canonicalParentPath = path.dirname(resolved.operationPath)
    const decision = await this.policy.evaluate({
      operation,
      phase,
      portablePath,
      canonicalPath: resolved.operationPath,
      canonicalParentPath,
    })
    if (!decision.allowed) {
      return { allowed: false, code: decision.code ?? 'policy_denied' }
    }
    return {
      allowed: true,
      path: {
        lexicalPath: resolved.fullPath,
        canonicalPath: resolved.realFullPath,
        canonicalParentPath,
        portablePath,
        operationPath: resolved.operationPath,
        redactPath: decision.redactPath === true,
      },
    }
  }

  private publicOperation(
    operation: MutableOperation,
  ): RegisteredFilesystemOperation {
    return {
      id: operation.id,
      kind: operation.kind,
      state: operation.state,
      portablePaths: operation.paths.map((item) =>
        item.redactPath ? '[redacted]' : item.portablePath,
      ),
    }
  }

  private makeReceipt(
    operation: MutableOperation,
    outcome: CommitReceipt['outcome'],
    error?: string,
  ): CommitReceipt {
    return {
      operationId: operation.id,
      outcome,
      paths: operation.paths.map((item) => ({
        label: item.redactPath ? '[redacted]' : item.portablePath,
        fingerprint: fingerprintPath(item.portablePath),
      })),
      ...(error ? { error: { code: sanitizeCode(error) } } : {}),
    }
  }

  private retainReceipt(receipt: CommitReceipt): void {
    this.receipts.push(receipt)
    if (this.receipts.length > MAX_COMMIT_RECEIPTS_PER_RUN) {
      this.receipts.splice(
        0,
        this.receipts.length - MAX_COMMIT_RECEIPTS_PER_RUN,
      )
    }
  }

  private pruneTerminalOperations(): void {
    if (this.operations.size <= MAX_REGISTERED_OPERATIONS_PER_RUN) return
    for (const [id, operation] of this.operations) {
      if (operation.state === 'open' || operation.state === 'committing') {
        continue
      }
      this.operations.delete(id)
      if (this.operations.size <= MAX_REGISTERED_OPERATIONS_PER_RUN) return
    }
  }

  private async acquireLock(key: string): Promise<() => void> {
    let entry = this.locks.get(key)
    if (!entry) {
      entry = { tail: Promise.resolve(), users: 0 }
      this.locks.set(key, entry)
    }
    const previous = entry.tail
    let releaseCurrent!: () => void
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve
    })
    entry.users += 1
    entry.tail = previous.then(() => current)
    await previous

    let released = false
    return () => {
      if (released) return
      released = true
      releaseCurrent()
      entry.users -= 1
      if (entry.users === 0 && this.locks.get(key) === entry) {
        this.locks.delete(key)
      }
    }
  }
}

export function detectFilesystemCapabilities(
  fileSystem: CodebuffFileSystem,
): FilesystemCapabilitySnapshot {
  const capabilities = new Set<FilesystemCapability>(['baseline'])
  if (typeof fileSystem.readRange === 'function') capabilities.add('range_read')
  if (typeof fileSystem.readTextRange === 'function') {
    capabilities.add('text_range_read')
  }
  if (typeof fileSystem.conditionalCommit === 'function') {
    capabilities.add('conditional_commit')
  }
  if (typeof fileSystem.conditionalDelete === 'function') {
    capabilities.add('conditional_delete')
  }
  if (typeof fileSystem.conditionalMove === 'function') {
    capabilities.add('conditional_move')
  }
  if (typeof fileSystem.createFileExclusive === 'function') {
    capabilities.add('exclusive_create')
  }
  return {
    tier:
      capabilities.has('conditional_commit') &&
      capabilities.has('conditional_delete') &&
      capabilities.has('conditional_move') &&
      capabilities.has('exclusive_create')
        ? fileSystem.mutationAuthority === 'native_atomic'
          ? 'atomic'
          : fileSystem.mutationAuthority === 'cooperative_cas'
            ? 'cooperative'
            : 'enhanced'
        : capabilities.size > 1
          ? 'enhanced'
          : 'baseline',
    capabilities,
  }
}

export function hashFileContent(content: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function expectedStateMatches(
  expected: ExpectedFileState,
  actual: FileSnapshot,
): boolean {
  if (actual.state === 'unavailable') return false
  if (expected.state === 'absent') return actual.state === 'absent'
  return actual.state === 'present' && actual.hash === expected.hash
}

function toPortablePath(relativePath: string): string {
  if (relativePath === '') return '.'
  return relativePath.split(path.sep).join('/')
}

function toBytes(content: string | NodeJS.ArrayBufferView): Uint8Array {
  if (typeof content === 'string') return Buffer.from(content)
  return new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
}

function fingerprintPath(portablePath: string): string {
  return createHash('sha256').update(portablePath).digest('hex').slice(0, 16)
}

function sanitizeCode(code: string): string {
  return /^[A-Z][A-Z0-9_.-]{0,63}$/.test(code) ? code : 'OPERATION_FAILED'
}

function errorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return sanitizeCode(error.code)
  }
  return 'UNAVAILABLE'
}

function compareCanonicalPaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
