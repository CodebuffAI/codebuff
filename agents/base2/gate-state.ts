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
}
