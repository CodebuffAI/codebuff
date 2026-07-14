import { createHash, randomUUID } from 'node:crypto'

import {
  orchestrationEventV1Schema,
  orchestrationLedgerV1Schema,
} from '@codebuff/common/types/orchestration-ledger'

import type {
  OrchestrationEventDraftV1,
  OrchestrationEventV1,
  OrchestrationLedgerV1,
} from '@codebuff/common/types/orchestration-ledger'
import type { AgentState } from '@codebuff/common/types/session-state'

const MAX_LEDGER_EVENTS = 256

function checksum(events: OrchestrationEventV1[], revision: number): string {
  return createHash('sha256')
    .update(JSON.stringify({ revision, events }))
    .digest('hex')
}

function compactEvents(events: OrchestrationEventV1[]): OrchestrationEventV1[] {
  if (events.length <= MAX_LEDGER_EVENTS) return events
  const unresolvedSpawnIds = new Set(
    events
      .filter((event) => event.type === 'spawn_started')
      .map((event) => event.spawnId),
  )
  for (const event of events) {
    if (event.type === 'spawn_finished') unresolvedSpawnIds.delete(event.spawnId)
  }
  const protectedEvents = events.filter(
    (event) =>
      (event.type === 'spawn_started' && unresolvedSpawnIds.has(event.spawnId)) ||
      (event.type === 'interrupted' && event.subjectType === 'spawn'),
  )
  const protectedIds = new Set(protectedEvents.map((event) => event.eventId))
  const tail = events
    .filter((event) => !protectedIds.has(event.eventId))
    .slice(-(MAX_LEDGER_EVENTS - Math.min(protectedEvents.length, 64)))
  return [...protectedEvents.slice(-64), ...tail].sort(
    (left, right) => left.sequence - right.sequence,
  )
}

export function appendOrchestrationEvent(params: {
  state: AgentState
  event: OrchestrationEventDraftV1
  expectedRevision?: number
}): OrchestrationLedgerV1 {
  const current = params.state.orchestrationLedger
  if (
    params.expectedRevision !== undefined &&
    params.expectedRevision !== (current?.revision ?? -1)
  ) {
    throw new Error(
      `Orchestration ledger revision conflict: expected ${params.expectedRevision}, current ${current?.revision ?? -1}.`,
    )
  }
  const eventId = params.event.eventId ?? randomUUID()
  if (current?.events.some((event) => event.eventId === eventId)) return current
  const reconciledReceiptId =
    params.event.type === 'receipt_reconciled'
      ? params.event.receiptId
      : undefined
  if (
    reconciledReceiptId !== undefined &&
    current?.events.some(
      (event) =>
        event.type === 'receipt_reconciled' &&
        event.receiptId === reconciledReceiptId,
    )
  ) {
    return current
  }
  const sequence = (current?.events.at(-1)?.sequence ?? -1) + 1
  const event = orchestrationEventV1Schema.parse({
    ...params.event,
    schemaVersion: 1,
    eventId,
    sequence,
    timestamp: params.event.timestamp ?? Date.now(),
  })
  const revision = (current?.revision ?? -1) + 1
  const events = compactEvents([...(current?.events ?? []), event])
  const ledger = orchestrationLedgerV1Schema.parse({
    schemaVersion: 1,
    revision,
    events,
    checksum: checksum(events, revision),
  })
  params.state.orchestrationLedger = ledger
  return ledger
}

export function reconcileInterruptedLedgerSpawns(state: AgentState): void {
  const events = state.orchestrationLedger?.events ?? []
  const finished = new Set(
    events
      .filter((event) => event.type === 'spawn_finished')
      .map((event) => event.spawnId),
  )
  const alreadyInterrupted = new Set(
    events.flatMap((event) =>
      event.type === 'interrupted' && event.subjectType === 'spawn'
        ? [event.subjectId]
        : [],
    ),
  )
  for (const event of events) {
    if (
      event.type !== 'spawn_started' ||
      finished.has(event.spawnId) ||
      alreadyInterrupted.has(event.spawnId)
    ) continue
    appendOrchestrationEvent({
      state,
      event: {
        type: 'interrupted',
        runId: state.runId ?? state.agentId,
        subjectType: 'spawn',
        subjectId: event.spawnId,
        reason: 'Run resumed without a durable terminal spawn receipt.',
        workspaceRevision: state.workspaceState?.revision,
        workspaceSnapshotId: state.workspaceState?.snapshotId,
      },
    })
  }
}
