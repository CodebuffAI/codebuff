import {
  proposalResultV1Schema,
  transitionProposalResultV1,
  type CommitReceiptV1,
  type FilesystemError,
  type ProposalActionErrorV1,
  type ProposalResultV1,
  type ProposalStateV1,
} from '@codebuff/common/tools/results/filesystem'
import { getContentHash } from '@codebuff/common/util/content-hash'

/** Compatibility artifact retained for programmatic-agent bundle consumers. */
export type ProposalLedgerArtifact = {
  seq: number
  attempt: number
  toolName:
    | 'propose_str_replace'
    | 'propose_write_file'
    | 'propose_edit_transaction'
  input: Record<string, unknown>
  result: {
    file: string
    ok: boolean
    unifiedDiff?: string
    message?: string
    errorMessage?: string
    finalContent?: string
    baseContentHash?: string | null
    baseContent?: string | null
  }
  proposalId: string
}

type StoredProposal = {
  attempt: number
  proposal: ProposalResultV1
}

type ApplicationLease = {
  token: string
  attempt: number
  revision: number
}

type RunLedger = {
  artifacts: ProposalLedgerArtifact[]
  proposals: Map<string, StoredProposal>
  applications: Map<string, ApplicationLease>
  currentAttempt: number
  nextSeq: number
  originalBaseContentByAttemptAndPath: Map<string, Promise<string | null>>
}

const ledgerByRunId = new Map<string, RunLedger>()

function getOrCreateRunLedger(runId: string): RunLedger {
  let ledger = ledgerByRunId.get(runId)
  if (!ledger) {
    ledger = {
      artifacts: [],
      proposals: new Map(),
      applications: new Map(),
      currentAttempt: 0,
      nextSeq: 0,
      originalBaseContentByAttemptAndPath: new Map(),
    }
    ledgerByRunId.set(runId, ledger)
  }
  return ledger
}

function proposalError(
  code: FilesystemError['code'],
  message: string,
  proposalId?: string,
  options: Partial<
    Pick<FilesystemError, 'retryable' | 'requiresFreshRead' | 'recovery'>
  > = {},
): ProposalActionErrorV1 {
  return {
    kind: 'proposal_action_error',
    version: 1,
    ...(proposalId ? { proposalId } : {}),
    error: {
      code,
      message,
      retryable: options.retryable ?? false,
      ...(options.requiresFreshRead !== undefined
        ? { requiresFreshRead: options.requiresFreshRead }
        : {}),
      ...(options.recovery ? { recovery: options.recovery } : {}),
    },
  }
}

export async function getOrCaptureOriginalBaseContent(
  runId: string,
  path: string,
  readOriginalBaseContent: () => Promise<string | null>,
): Promise<string | null> {
  const ledger = getOrCreateRunLedger(runId)
  const key = `${ledger.currentAttempt}:${path}`
  const existing = ledger.originalBaseContentByAttemptAndPath.get(key)
  if (existing) return existing
  const contentPromise = readOriginalBaseContent()
  ledger.originalBaseContentByAttemptAndPath.set(key, contentPromise)
  return contentPromise
}

/** Successful creation commits the typed proposal and compatibility artifact. */
export function appendProposalArtifact(
  runId: string,
  artifact: Omit<ProposalLedgerArtifact, 'seq' | 'attempt' | 'proposalId'> & {
    proposal?: ProposalResultV1
    proposalId?: string
  },
): ProposalResultV1 | undefined {
  const ledger = getOrCreateRunLedger(runId)
  const seq = ledger.nextSeq++
  if (!artifact.result.ok) {
    ledger.artifacts.push({
      input: artifact.input,
      result: artifact.result,
      toolName: artifact.toolName,
      proposalId: `failed:${runId}:${ledger.currentAttempt}:${seq}`,
      seq,
      attempt: ledger.currentAttempt,
    })
    return undefined
  }
  if (artifact.proposalId) {
    const existing = getProposalRecord(runId, artifact.proposalId)
    if (!existing) {
      throw new Error(`Unknown proposal ID: ${artifact.proposalId}`)
    }
    ledger.artifacts.push({
      input: artifact.input,
      result: artifact.result,
      toolName: artifact.toolName,
      proposalId: artifact.proposalId,
      seq,
      attempt: ledger.currentAttempt,
    })
    return existing
  }
  const now = new Date().toISOString()
  const proposal = proposalResultV1Schema.parse(
    artifact.proposal ?? {
      kind: 'proposal_result',
      version: 1,
      proposalId: crypto.randomUUID(),
      revision: 1,
      baseHash: getContentHash(
        `${artifact.result.file}\0${artifact.result.baseContentHash ?? 'absent'}`,
      ),
      state: 'proposed',
      operations: [
        {
          actionId: `${runId}:${seq}:0`,
          index: 0,
          action: artifact.result.baseContent === null ? 'create' : 'update',
          path: artifact.result.file,
          baseHash: artifact.result.baseContentHash ?? null,
          ...(artifact.result.finalContent !== undefined
            ? { finalContent: artifact.result.finalContent }
            : {}),
          ...(artifact.result.unifiedDiff
            ? { patch: artifact.result.unifiedDiff }
            : {}),
        },
      ],
      createdAt: now,
      updatedAt: now,
      errors: [],
    },
  )
  if (ledger.proposals.has(proposal.proposalId)) {
    throw new Error(`Duplicate proposal ID: ${proposal.proposalId}`)
  }
  ledger.proposals.set(proposal.proposalId, {
    attempt: ledger.currentAttempt,
    proposal,
  })
  ledger.artifacts.push({
    input: artifact.input,
    result: artifact.result,
    toolName: artifact.toolName,
    proposalId: proposal.proposalId,
    seq,
    attempt: ledger.currentAttempt,
  })
  return proposal
}

export function getProposalLedger(runId: string): ProposalLedgerArtifact[] {
  const ledger = ledgerByRunId.get(runId)
  if (!ledger) return []
  return ledger.artifacts.filter(
    (artifact) => artifact.attempt === ledger.currentAttempt,
  )
}

export function getProposalRecord(
  runId: string,
  proposalId: string,
): ProposalResultV1 | undefined {
  const ledger = ledgerByRunId.get(runId)
  const stored = ledger?.proposals.get(proposalId)
  return stored && stored.attempt === ledger?.currentAttempt
    ? stored.proposal
    : undefined
}

export function getProposalRecords(
  runId: string,
  proposalIds?: readonly string[],
): Array<ProposalResultV1 | ProposalActionErrorV1> {
  const ledger = ledgerByRunId.get(runId)
  if (!ledger) {
    return (proposalIds ?? []).map((proposalId) =>
      proposalError('not_found', 'proposal was not found', proposalId, {
        retryable: true,
        recovery: 'read_again',
      }),
    )
  }
  if (!proposalIds) {
    return [...ledger.proposals.values()]
      .filter((stored) => stored.attempt === ledger.currentAttempt)
      .map((stored) => stored.proposal)
  }
  return proposalIds.map(
    (proposalId) =>
      getProposalRecord(runId, proposalId) ??
      proposalError('not_found', 'proposal was not found', proposalId, {
        retryable: true,
        recovery: 'read_again',
      }),
  )
}

export function transitionStoredProposal(params: {
  runId: string
  proposalId: string
  expectedRevision: number
  expectedBaseHash: string
  state: 'accepted' | 'rejected'
  updatedAt: string
}): ProposalResultV1 | ProposalActionErrorV1 {
  const ledger = getOrCreateRunLedger(params.runId)
  const proposal = getProposalRecord(params.runId, params.proposalId)
  if (!proposal) {
    return proposalError(
      'not_found',
      'proposal was not found',
      params.proposalId,
      { retryable: true, recovery: 'read_again' },
    )
  }
  const applying = ledger.applications.has(params.proposalId)
  if (applying && proposal.state !== params.state) {
    return proposalError(
      'illegal_transition',
      'proposal application is already in progress',
      params.proposalId,
    )
  }
  const transition = transitionProposalResultV1(proposal, params)
  if (!transition.ok) {
    return proposalError(
      transition.error.code,
      transition.error.message,
      params.proposalId,
      transition.error,
    )
  }
  ledger.proposals.set(params.proposalId, {
    attempt: ledger.currentAttempt,
    proposal: transition.proposal,
  })
  return transition.proposal
}

export type BeginProposalApplicationResult =
  | {
      ok: true
      proposal: ProposalResultV1
      token?: string
      idempotent: boolean
    }
  | { ok: false; error: ProposalActionErrorV1 }

export function beginProposalApplication(params: {
  runId: string
  proposalId: string
  expectedRevision: number
  expectedBaseHash: string
}): BeginProposalApplicationResult {
  const ledger = getOrCreateRunLedger(params.runId)
  const proposal = getProposalRecord(params.runId, params.proposalId)
  if (!proposal) {
    return {
      ok: false,
      error: proposalError(
        'not_found',
        'proposal was not found',
        params.proposalId,
        { retryable: true, recovery: 'read_again' },
      ),
    }
  }
  if (proposal.state === 'applied') {
    return { ok: true, proposal, idempotent: true }
  }
  if (proposal.state !== 'accepted') {
    return {
      ok: false,
      error: proposalError(
        'illegal_transition',
        `proposal cannot be applied from ${proposal.state}`,
        params.proposalId,
      ),
    }
  }
  if (
    proposal.revision !== params.expectedRevision ||
    proposal.baseHash !== params.expectedBaseHash
  ) {
    return {
      ok: false,
      error: proposalError(
        'stale_state',
        'proposal revision or base hash is stale',
        params.proposalId,
        { retryable: true, requiresFreshRead: true, recovery: 'read_again' },
      ),
    }
  }
  if (ledger.applications.has(params.proposalId)) {
    return {
      ok: false,
      error: proposalError(
        'illegal_transition',
        'proposal application is already in progress',
        params.proposalId,
      ),
    }
  }
  const token = crypto.randomUUID()
  ledger.applications.set(params.proposalId, {
    token,
    attempt: ledger.currentAttempt,
    revision: proposal.revision,
  })
  return { ok: true, proposal, token, idempotent: false }
}

function finishProposalTransition(params: {
  runId: string
  proposalId: string
  token: string
  state: Extract<ProposalStateV1, 'stale' | 'applied'>
  updatedAt: string
  commitReceipt?: CommitReceiptV1
}): ProposalResultV1 | ProposalActionErrorV1 {
  const ledger = getOrCreateRunLedger(params.runId)
  const lease = ledger.applications.get(params.proposalId)
  const proposal = getProposalRecord(params.runId, params.proposalId)
  if (!lease || lease.token !== params.token || !proposal) {
    return proposalError(
      'stale_state',
      'proposal application lease is stale',
      params.proposalId,
      { retryable: true, recovery: 'read_again' },
    )
  }
  const transition = transitionProposalResultV1(proposal, {
    proposalId: params.proposalId,
    expectedRevision: lease.revision,
    expectedBaseHash: proposal.baseHash,
    state: params.state,
    updatedAt: params.updatedAt,
    ...(params.commitReceipt ? { commitReceipt: params.commitReceipt } : {}),
  })
  ledger.applications.delete(params.proposalId)
  if (!transition.ok) {
    return proposalError(
      transition.error.code,
      transition.error.message,
      params.proposalId,
      transition.error,
    )
  }
  ledger.proposals.set(params.proposalId, {
    attempt: ledger.currentAttempt,
    proposal: transition.proposal,
  })
  return transition.proposal
}

export function markProposalApplicationStale(params: {
  runId: string
  proposalId: string
  token: string
  updatedAt: string
}): ProposalResultV1 | ProposalActionErrorV1 {
  return finishProposalTransition({ ...params, state: 'stale' })
}

export function completeProposalApplication(params: {
  runId: string
  proposalId: string
  token: string
  updatedAt: string
  commitReceipt: CommitReceiptV1
}): ProposalResultV1 | ProposalActionErrorV1 {
  return finishProposalTransition({ ...params, state: 'applied' })
}

export function abortProposalApplication(
  runId: string,
  proposalId: string,
  token: string,
): void {
  const lease = ledgerByRunId.get(runId)?.applications.get(proposalId)
  if (lease?.token === token) {
    ledgerByRunId.get(runId)?.applications.delete(proposalId)
  }
}

export function startNewProposalAttempt(runId: string): void {
  const ledger = getOrCreateRunLedger(runId)
  ledger.currentAttempt++
  ledger.applications.clear()
}

export function clearProposalLedgerForRun(runId: string): void {
  ledgerByRunId.delete(runId)
}

export function clearAllProposalLedgers(): void {
  ledgerByRunId.clear()
}
