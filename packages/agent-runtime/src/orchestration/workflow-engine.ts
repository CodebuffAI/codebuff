/**
 * ADVISORY / TELEMETRY-ONLY workflow state machine.
 *
 * This module is NOT the authoritative orchestration gate. The controlling
 * turn lifecycle (validation hooks, aux gates, and the code-reviewer
 * finalization verdict) lives in `createBase2`'s serialized `handleSteps`
 * generator in `agents/base2/base2.ts`. `transitionWorkflow` and the
 * `WorkflowStateV1` records it produces are bookkeeping/telemetry: they record
 * declarative subflow state (persisted on `AgentState.workflowStates`) for
 * resumability and observability, but they do not decide whether a turn may
 * finalize. Do not reroute the base2 gate through this engine or treat its
 * state as a completion authority; keep it as advisory metadata unless a future
 * change deliberately promotes it (which would require moving the gate
 * decision here and updating the base2 handleSteps contract).
 */
export type WorkflowTransitionV1 = {
  event: string
  from: string[]
  to: string
}

export type WorkflowDefinitionV1 = {
  schemaVersion: 1
  id: string
  initialState: string
  terminalStates: string[]
  transitions: WorkflowTransitionV1[]
}

export type WorkflowStateV1 = {
  schemaVersion: 1
  workflowId: string
  state: string
  revision: number
  updatedAt: number
  lastEvent?: string
}

export function transitionWorkflow(params: {
  definition: WorkflowDefinitionV1
  current?: WorkflowStateV1
  event: string
  expectedRevision?: number
}): WorkflowStateV1 {
  const current =
    params.current ?? {
      schemaVersion: 1 as const,
      workflowId: params.definition.id,
      state: params.definition.initialState,
      revision: 0,
      updatedAt: Date.now(),
    }
  if (current.workflowId !== params.definition.id) {
    throw new Error(
      `Workflow state ${current.workflowId} cannot be used with ${params.definition.id}.`,
    )
  }
  if (
    params.expectedRevision !== undefined &&
    params.expectedRevision !== current.revision
  ) {
    throw new Error(
      `Workflow revision conflict: expected ${params.expectedRevision}, current ${current.revision}.`,
    )
  }
  const transition = params.definition.transitions.find(
    (candidate) =>
      candidate.event === params.event && candidate.from.includes(current.state),
  )
  if (!transition) {
    throw new Error(
      `Illegal ${params.definition.id} transition: ${current.state} --${params.event}--> ?.`,
    )
  }
  return {
    schemaVersion: 1,
    workflowId: params.definition.id,
    state: transition.to,
    revision: current.revision + 1,
    updatedAt: Date.now(),
    lastEvent: params.event,
  }
}

export const base2GateWorkflowV1: WorkflowDefinitionV1 = {
  schemaVersion: 1,
  id: 'base2-gate-v1',
  initialState: 'idle',
  terminalStates: ['final_response_allowed'],
  transitions: [
    { event: 'awaiting_validation', from: ['idle', 'blocked', 'repair_loop', 'awaiting_review', 'final_response_allowed'], to: 'awaiting_validation' },
    { event: 'awaiting_review', from: ['idle', 'awaiting_validation', 'repair_loop', 'blocked'], to: 'awaiting_review' },
    { event: 'repair_loop', from: ['awaiting_validation', 'awaiting_review', 'blocked'], to: 'repair_loop' },
    { event: 'blocked', from: ['idle', 'awaiting_validation', 'awaiting_review', 'repair_loop', 'blocked'], to: 'blocked' },
    { event: 'final_response_allowed', from: ['idle', 'awaiting_validation', 'awaiting_review', 'blocked'], to: 'final_response_allowed' },
  ],
}

export function transitionBase2Gate(params: {
  current?: WorkflowStateV1
  phase: string
}): WorkflowStateV1 {
  return transitionWorkflow({
    definition: base2GateWorkflowV1,
    current: params.current,
    event: params.phase,
  })
}
