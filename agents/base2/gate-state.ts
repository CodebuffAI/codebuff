export type Base2ActiveWorkPhase =
  | 'idle'
  | 'awaiting_validation'
  | 'repair_loop'
  | 'awaiting_review'
  | 'blocked'
  | 'final_response_allowed'

export type Base2WorkflowTodo = {
  content: string
  status: string
  completed: boolean
}

export type Base2WorkflowTodoProgress = {
  todos: Base2WorkflowTodo[]
  completedCount: number
  totalCount: number
  nextWorkflowAction: string
}

// Typed runtime-owned gate state. Field names are kept identical to the
// historical Base2ActiveWorkState shape so existing serialized
// base2ActiveWork objects keep round-tripping. The new
// gatePassedFingerprint is required for durable gate-pass reuse. States
// that lack a fingerprint (older serialized state, or any pass that did
// not capture working-tree content hashes) fail closed and rerun the
// validation/reviewer gate instead of reusing the stored pass.
export type Base2GateState = {
  pendingGateFiles: string[]
  gatePassedFiles: string[]
  gatePassedPendingFiles: string[]
  gatePassedReviewerVerdict: string
  gatePassedValidationSummary: string
  gatePassedFingerprint: string
  lastReviewerGateSkipReason: string
}

export type Base2ActiveWorkState = Base2GateState & {
  touchedFiles: string[]
  changedFiles: string[]
  currentPhase: Base2ActiveWorkPhase
  latestWorkSummary: string
  openReviewerBlockers: string[]
  lastValidationSummary: string
  nextRequiredAction: string
  lastPinnedStateMessage: string
  workflowTodoProgress?: Base2WorkflowTodoProgress
  /**
   * Number of automated repair-editor rounds that have run for the current
   * batch of pending gate files. Reset to 0 whenever the gate passes or a
   * fresh set of edits is recorded. Bounded by MAX_REPAIR_ROUNDS in base2.ts
   * (default 3). Backward-compatible: older serialized state without this
   * field is treated as 0.
   */
  repairRoundCount?: number
  /**
   * Durable token of the active repair session. Set when the repair loop
   * begins (first round) and cleared only when the gate passes. While a
   * session is active, recordChangedFiles does NOT reset repairRoundCount,
   * preventing reset-on-edit circumvention where a spurious non-repair edit
   * to a failing file would silently reset the repair budget. Backward-
   * compatible: older serialized state lacks this field (treated as no
   * active session).
   */
  repairSessionId?: string
  /**
   * True after the single post-budget escalation editor round has run. The
   * escalation round fires once after MAX_REPAIR_ROUNDS is exhausted, with a
   * broader root-cause prompt, before the gate falls back to blocked. Ensures
   * escalation is not repeated on every re-entry to the same failing batch.
   * Backward-compatible.
   */
  repairEscalationDone?: boolean
  /**
   * When true, the reviewer gate runs as a static-only review concurrently
   * with the blocking validation hooks (M3.1). The reviewer is spawned in the
   * background before validation and joined via check_background_agent only if
   * validation passes; a validation failure still blocks finalization and
   * ignores the background reviewer. Defaults to false to preserve the existing
   * sequential validation-then-reviewer behavior. Backward-compatible.
   */
  staticReviewOnly?: boolean
  /**
   * Stashed jobId of a background-spawned static reviewer, set when the
   * reviewer is spawned in the background before validation and consumed via
   * check_background_agent after validation passes. Cleared whenever the gate
   * passes. Backward-compatible: older serialized state lacks this field.
   */
  staticReviewerJobId?: string
  /**
   * M3 (R1a) — true after the automated pre-edit security-reviewer gate has
   * fired for the current pending gate file set. Reset to false whenever the
   * pending gate file set changes (detected via auxGatesLastPendingFiles vs
   * gateFileSetsEqual). Backward-compatible: older serialized state lacks
   * this field (treated as false).
   */
  preEditSecurityReviewDone?: boolean
  /**
   * M3 (R1b) — true after the automated post-edit test-writer gate has fired
   * for the current pending gate file set. Reset on pending-file-set change.
   * Backward-compatible.
   */
  testWriterGateDone?: boolean
  /**
   * M3 (R1c) — true after the automated post-edit doc-writer gate has fired
   * for the current pending gate file set. Reset on pending-file-set change.
   * Backward-compatible.
   */
  docWriterGateDone?: boolean
  /**
   * M3 (R1d) — snapshot of the pendingGateFiles used to detect that the
   * pending gate file set has changed, so the three aux-gate done-flags above
   * can be reset via gateFileSetsEqual. Backward-compatible: older serialized
   * state lacks this field (treated as empty).
   */
  auxGatesLastPendingFiles?: string[]
}
