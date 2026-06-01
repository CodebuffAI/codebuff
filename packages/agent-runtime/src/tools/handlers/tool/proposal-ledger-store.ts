/**
 * Deterministic per-run proposal artifact ledger.
 *
 * Proposal tools (`propose_str_replace`, `propose_write_file`,
 * `propose_edit_transaction`) record one
 * complete, verbatim artifact here the moment they execute. This is the single
 * source of truth for what a proposal bundle contains — it does NOT depend on
 * the model's message history surviving truncation, retries, XML-vs-native tool
 * formatting, or abort timing. Mirrors the per-runId ownership and teardown of
 * proposed-content-store.ts.
 *
 * Determinism guarantees:
 * - Append-only and ordered by `seq` within a run.
 * - Scoped to the current attempt: `startNewProposalAttempt` makes prior
 *   (failed) attempts invisible to `getProposalLedger`, so stale failed edits
 *   can never leak into a corrected retry.
 * - Cleared on every run-teardown path (see clearAgentGeneratorForRun).
 */

/** A single recorded proposal tool call and its computed result. */
export type ProposalLedgerArtifact = {
  /** Monotonic order within the run (across all attempts). */
  seq: number
  /** 0-based attempt index; bumped on each PROPOSAL_RETRY boundary. */
  attempt: number
  toolName:
    | 'propose_str_replace'
    | 'propose_write_file'
    | 'propose_edit_transaction'
  /** The exact tool input, so the parent can always convert it to a real edit. */
  input: Record<string, any>
  result: {
    file: string
    /** true when the proposal produced an applyable diff with no failure. */
    ok: boolean
    unifiedDiff?: string
    message?: string
    errorMessage?: string
  }
}

type RunLedger = {
  artifacts: ProposalLedgerArtifact[]
  currentAttempt: number
  nextSeq: number
}

const ledgerByRunId = new Map<string, RunLedger>()

function getOrCreateRunLedger(runId: string): RunLedger {
  let ledger = ledgerByRunId.get(runId)
  if (!ledger) {
    ledger = { artifacts: [], currentAttempt: 0, nextSeq: 0 }
    ledgerByRunId.set(runId, ledger)
  }
  return ledger
}

/** Record one proposal artifact for a run, tagged with the current attempt. */
export function appendProposalArtifact(
  runId: string,
  artifact: Omit<ProposalLedgerArtifact, 'seq' | 'attempt'>,
): void {
  const ledger = getOrCreateRunLedger(runId)
  ledger.artifacts.push({
    ...artifact,
    seq: ledger.nextSeq++,
    attempt: ledger.currentAttempt,
  })
}

/**
 * Current-attempt artifacts in deterministic order. This is what the implementor
 * finalizes its output from. Earlier-attempt artifacts are intentionally hidden.
 */
export function getProposalLedger(runId: string): ProposalLedgerArtifact[] {
  const ledger = ledgerByRunId.get(runId)
  if (!ledger) return []
  return ledger.artifacts.filter(
    (artifact) => artifact.attempt === ledger.currentAttempt,
  )
}

/**
 * Begin a new proposal attempt. Subsequent appends and `getProposalLedger`
 * reads belong to this attempt; prior-attempt artifacts remain stored only for
 * diagnostics and are never returned by `getProposalLedger`.
 */
export function startNewProposalAttempt(runId: string): void {
  const ledger = getOrCreateRunLedger(runId)
  ledger.currentAttempt++
}

/** Remove all ledger state for a run. Idempotent; safe on every exit path. */
export function clearProposalLedgerForRun(runId: string): void {
  ledgerByRunId.delete(runId)
}

/** Clear all ledgers (testing only). */
export function clearAllProposalLedgers(): void {
  ledgerByRunId.clear()
}
