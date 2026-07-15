import { describe, expect, test } from 'bun:test'

import { getInitialAgentState } from '@codebuff/common/types/session-state'

import {
  appendOrchestrationEvent,
  reconcileInterruptedLedgerSpawns,
} from '../orchestration-ledger'

describe('orchestration ledger', () => {
  test('enforces compare-and-swap revisions for new events', () => {
    const state = getInitialAgentState()
    appendOrchestrationEvent({
      state,
      expectedRevision: -1,
      event: {
        eventId: 'event-1',
        type: 'task_claimed',
        runId: 'run-1',
        taskId: 'P1.1',
      },
    })

    expect(() =>
      appendOrchestrationEvent({
        state,
        expectedRevision: -1,
        event: {
          eventId: 'event-2',
          type: 'task_claimed',
          runId: 'run-1',
          taskId: 'P1.2',
        },
      }),
    ).toThrow('revision conflict')
    expect(state.orchestrationLedger?.revision).toBe(0)
  })

  test('accepts idempotent event and receipt replays despite a stale revision', () => {
    const state = getInitialAgentState()
    const first = appendOrchestrationEvent({
      state,
      expectedRevision: -1,
      event: {
        eventId: 'receipt-event-1',
        type: 'receipt_reconciled',
        runId: 'run-1',
        receiptId: 'receipt-1',
        taskId: 'P1.1',
        agentType: 'editor',
        status: 'completed',
      },
    })

    const eventReplay = appendOrchestrationEvent({
      state,
      expectedRevision: -1,
      event: {
        eventId: 'receipt-event-1',
        type: 'receipt_reconciled',
        runId: 'run-1',
        receiptId: 'receipt-1',
        taskId: 'P1.1',
        agentType: 'editor',
        status: 'completed',
      },
    })
    const receiptReplay = appendOrchestrationEvent({
      state,
      expectedRevision: -1,
      event: {
        eventId: 'receipt-event-2',
        type: 'receipt_reconciled',
        runId: 'run-1',
        receiptId: 'receipt-1',
        taskId: 'P1.1',
        agentType: 'editor',
        status: 'completed',
      },
    })

    expect(eventReplay).toBe(first)
    expect(receiptReplay).toBe(first)
    expect(first.events).toHaveLength(1)
  })

  test('reconciles an unresolved spawn once after interruption', () => {
    const state = getInitialAgentState()
    state.runId = 'run-1'
    appendOrchestrationEvent({
      state,
      event: {
        type: 'spawn_started',
        runId: 'run-1',
        spawnId: 'spawn-1',
        agentType: 'editor',
      },
    })

    reconcileInterruptedLedgerSpawns(state)
    reconcileInterruptedLedgerSpawns(state)

    expect(
      state.orchestrationLedger?.events.filter(
        (event) => event.type === 'interrupted',
      ),
    ).toHaveLength(1)
  })

  test('preserves unresolved spawn evidence while bounding the event ledger', () => {
    const state = getInitialAgentState()
    appendOrchestrationEvent({
      state,
      event: {
        eventId: 'unresolved-spawn',
        type: 'spawn_started',
        runId: 'run-1',
        spawnId: 'spawn-1',
        agentType: 'editor',
      },
    })
    for (let index = 0; index < 300; index++) {
      appendOrchestrationEvent({
        state,
        event: {
          eventId: `model-${index}`,
          type: 'model_selected',
          runId: 'run-1',
          agentType: 'editor',
          model: `model-${index}`,
          reason: 'test selection',
        },
      })
    }

    expect(state.orchestrationLedger?.events.length).toBeLessThanOrEqual(256)
    expect(
      state.orchestrationLedger?.events.some(
        (event) => event.eventId === 'unresolved-spawn',
      ),
    ).toBe(true)
    expect(state.orchestrationLedger?.revision).toBe(300)
  })
})
