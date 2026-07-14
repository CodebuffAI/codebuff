import { z } from 'zod/v4'

const eventBase = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  runId: z.string().min(1),
  workspaceRevision: z.number().int().nonnegative().optional(),
  workspaceSnapshotId: z.string().min(1).optional(),
})

export const orchestrationEventV1Schema = z.discriminatedUnion('type', [
  eventBase.extend({
    type: z.literal('model_selected'),
    agentType: z.string().min(1),
    model: z.string().optional(),
    contextWindowTokens: z.number().int().positive().optional(),
    reason: z.string().min(1),
  }),
  eventBase.extend({
    type: z.literal('spawn_started'),
    spawnId: z.string().min(1),
    taskId: z.string().optional(),
    agentType: z.string().min(1),
    parentRunId: z.string().optional(),
    capabilityId: z.string().optional(),
  }),
  eventBase.extend({
    type: z.literal('spawn_finished'),
    spawnId: z.string().min(1),
    agentType: z.string().min(1),
    status: z.enum(['completed', 'partial', 'blocked', 'failed', 'cancelled']),
    receiptId: z.string().optional(),
  }),
  eventBase.extend({
    type: z.literal('receipt_reconciled'),
    receiptId: z.string().min(1),
    taskId: z.string().min(1),
    agentType: z.string().min(1),
    status: z.enum(['completed', 'partial', 'blocked', 'failed', 'cancelled']),
  }),
  eventBase.extend({
    type: z.literal('task_claimed'),
    taskId: z.string().min(1),
    planRevision: z.number().int().nonnegative().optional(),
  }),
  eventBase.extend({
    type: z.literal('task_completed'),
    taskId: z.string().min(1),
    validationReceiptIds: z.array(z.string()).default([]),
    reviewReceiptIds: z.array(z.string()).default([]),
  }),
  eventBase.extend({
    type: z.literal('validation_recorded'),
    receiptId: z.string().min(1),
    status: z.enum(['passed', 'failed', 'skipped']),
    files: z.array(z.string()),
  }),
  eventBase.extend({
    type: z.literal('review_recorded'),
    receiptId: z.string().min(1),
    verdict: z.enum(['LOOKS_GOOD', 'NON_BLOCKING', 'BLOCKING']),
    files: z.array(z.string()),
  }),
  eventBase.extend({
    type: z.literal('mutation_committed'),
    receiptId: z.string().min(1),
    paths: z.array(z.string()),
  }),
  eventBase.extend({
    type: z.literal('gate_transition'),
    gate: z.string().min(1),
    from: z.string().optional(),
    to: z.string().min(1),
    reason: z.string().min(1),
    validationReceiptId: z.string().optional(),
    reviewReceiptId: z.string().optional(),
  }),
  eventBase.extend({
    type: z.literal('interrupted'),
    subjectType: z.enum(['spawn', 'task', 'gate']),
    subjectId: z.string().min(1),
    reason: z.string().min(1),
  }),
])

export const orchestrationLedgerV1Schema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  events: z.array(orchestrationEventV1Schema),
})

export type OrchestrationEventV1 = z.infer<
  typeof orchestrationEventV1Schema
>
export type OrchestrationLedgerV1 = z.infer<
  typeof orchestrationLedgerV1Schema
>
export type OrchestrationEventDraftV1 =
  OrchestrationEventV1 extends infer Event
    ? Event extends OrchestrationEventV1
      ? Omit<Event, 'schemaVersion' | 'eventId' | 'sequence' | 'timestamp'> & {
          eventId?: string
          timestamp?: number
        }
      : never
    : never
