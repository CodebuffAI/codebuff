import { describe, expect, test } from 'bun:test'

import {
  base2GateWorkflowV1,
  transitionBase2Gate,
  transitionWorkflow,
} from '../workflow-engine'

describe('workflow engine', () => {
  test('applies a declared transition with compare-and-swap revision', () => {
    const next = transitionWorkflow({
      definition: base2GateWorkflowV1,
      event: 'awaiting_validation',
      expectedRevision: 0,
    })

    expect(next).toMatchObject({
      workflowId: 'base2-gate-v1',
      state: 'awaiting_validation',
      revision: 1,
      lastEvent: 'awaiting_validation',
    })
    expect(() =>
      transitionWorkflow({
        definition: base2GateWorkflowV1,
        current: next,
        event: 'awaiting_review',
        expectedRevision: 0,
      }),
    ).toThrow('revision conflict')
  })

  test('rejects illegal transitions and mismatched workflow state', () => {
    const reviewing = transitionBase2Gate({ phase: 'awaiting_review' })
    const repair = transitionBase2Gate({
      current: reviewing,
      phase: 'repair_loop',
    })
    expect(repair.state).toBe('repair_loop')
    expect(() =>
      transitionBase2Gate({ current: repair, phase: 'final_response_allowed' }),
    ).toThrow('Illegal base2-gate-v1 transition')
    expect(() =>
      transitionWorkflow({
        definition: base2GateWorkflowV1,
        current: { ...repair, workflowId: 'another-workflow' },
        event: 'blocked',
      }),
    ).toThrow('cannot be used with')
  })

  test('reopens validation after a previously allowed final response', () => {
    const allowed = transitionBase2Gate({ phase: 'final_response_allowed' })
    const reopened = transitionBase2Gate({
      current: allowed,
      phase: 'awaiting_validation',
    })

    expect(reopened).toMatchObject({
      state: 'awaiting_validation',
      revision: 2,
      lastEvent: 'awaiting_validation',
    })
  })
})
