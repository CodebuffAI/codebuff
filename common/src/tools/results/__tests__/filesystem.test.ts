import { describe, expect, it } from 'bun:test'

import {
  buildFileMutationResultFromReceiptV1,
  buildNativeToolResultErrorOutputV1,
  buildProposalResultV1,
  buildReadFilesResultV1,
  canTransitionToolLifecycleV1,
  commitReceiptV1Schema,
  fileCapabilityAuthorizesV1,
  fileMutationResultV1Schema,
  filesystemErrorCodeSchema,
  getConfirmedAppliedActionsV1,
  isReadFilesResultV1,
  proposalResultV1Schema,
  nativeToolResultErrorOutputV1Schema,
  readFilesResultV1Schema,
  reconcileFileMutationResultV1,
  transitionProposalResultV1,
} from '../filesystem'

describe('structured filesystem results', () => {
  it('builds invariant-preserving read_files summaries', () => {
    const result = buildReadFilesResultV1([
      {
        selector: 'file',
        requestIndex: 0,
        path: 'src/a.ts',
        status: 'ok',
        content: 'a',
        complete: true,
        template: false,
      },
      {
        selector: 'symbols',
        requestIndex: 1,
        path: 'src/b.ts',
        status: 'error',
        error: {
          code: 'no_match',
          message: 'No requested symbols found',
          retryable: true,
          recovery: 'choose_symbol',
        },
      },
    ])

    expect(result.status).toBe('partial')
    expect(result.summary).toEqual({
      requested: 2,
      ok: 1,
      partial: 0,
      failed: 1,
      uniquePaths: 2,
    })
    expect(isReadFilesResultV1(result)).toBe(true)
  })

  it('rejects inconsistent summaries', () => {
    const parsed = readFilesResultV1Schema.safeParse({
      kind: 'read_files_result',
      version: 1,
      status: 'ok',
      summary: { requested: 0, ok: 0, partial: 0, failed: 0, uniquePaths: 0 },
      results: [
        {
          selector: 'file',
          requestIndex: 0,
          path: 'src/a.ts',
          status: 'ok',
          content: 'a',
          complete: true,
          template: false,
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  it('requires exactly one payload or omission marker for successful items', () => {
    const base = {
      kind: 'read_files_result' as const,
      version: 1 as const,
      status: 'ok' as const,
      summary: {
        requested: 1,
        ok: 1,
        partial: 0,
        failed: 0,
        uniquePaths: 1,
      },
    }

    expect(
      readFilesResultV1Schema.safeParse({
        ...base,
        results: [
          {
            selector: 'file',
            requestIndex: 0,
            path: 'src/a.ts',
            status: 'ok',
            complete: true,
            template: false,
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      readFilesResultV1Schema.safeParse({
        ...base,
        results: [
          {
            selector: 'file',
            requestIndex: 0,
            path: 'src/a.ts',
            status: 'ok',
            content: 'a',
            contentOmittedForLength: true,
            complete: true,
            template: false,
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects aggregate status and request-index drift', () => {
    const result = buildReadFilesResultV1([
      {
        selector: 'file',
        requestIndex: 0,
        path: 'src/a.ts',
        status: 'ok',
        content: 'a',
        complete: true,
        template: false,
      },
    ])

    expect(
      readFilesResultV1Schema.safeParse({ ...result, status: 'partial' })
        .success,
    ).toBe(false)
    expect(
      readFilesResultV1Schema.safeParse({
        ...result,
        results: [{ ...result.results[0], requestIndex: 1 }],
      }).success,
    ).toBe(false)
    expect(
      readFilesResultV1Schema.safeParse({
        ...result,
        summary: { ...result.summary, ok: 0, failed: 1 },
      }).success,
    ).toBe(false)
  })
})

const portableReceipt = {
  kind: 'commit_receipt' as const,
  version: 1 as const,
  receiptId: 'receipt-1',
  operationId: 'operation-1',
  callId: 'call-1',
  authorityTier: 'portable_path' as const,
  status: 'committed' as const,
  actions: [
    {
      actionId: 'action-1',
      index: 0,
      action: 'update' as const,
      path: 'src/a.ts',
      status: 'committed' as const,
      beforeHash: 'sha256:before',
      afterHash: 'sha256:after',
    },
  ],
  finalHashes: { 'src/a.ts': 'sha256:after' },
}

describe('tool lifecycle contracts', () => {
  it('allows only monotonic queued/running/terminal transitions', () => {
    const queued = {
      kind: 'tool_lifecycle' as const,
      version: 1 as const,
      callId: 'call-1',
      sequence: 0,
      state: 'queued' as const,
    }
    const running = { ...queued, sequence: 1, state: 'running' as const }
    const failed = { ...running, sequence: 2, state: 'failed' as const }

    expect(canTransitionToolLifecycleV1(queued, running)).toBe(true)
    expect(canTransitionToolLifecycleV1(running, failed)).toBe(true)
    expect(canTransitionToolLifecycleV1(queued, failed)).toBe(false)
    expect(
      canTransitionToolLifecycleV1(failed, {
        ...failed,
        sequence: 3,
        state: 'succeeded',
      }),
    ).toBe(false)
    expect(
      canTransitionToolLifecycleV1(running, { ...failed, sequence: 1 }),
    ).toBe(false)
  })

  it('builds a redacted typed malformed native-result failure', () => {
    const output = buildNativeToolResultErrorOutputV1({
      toolName: 'write_file',
      callId: 'call-malformed',
      issueCount: 3,
    })

    expect(nativeToolResultErrorOutputV1Schema.parse(output)[0].value).toEqual(
      expect.objectContaining({
        kind: 'native_tool_result_error',
        toolName: 'write_file',
        issueCount: 3,
        lifecycle: expect.objectContaining({ state: 'failed' }),
        error: expect.objectContaining({ code: 'malformed_result' }),
      }),
    )
    expect(JSON.stringify(output)).not.toContain('path')
    expect(JSON.stringify(output)).not.toContain('content')
  })
})

describe('snapshot capabilities', () => {
  const snapshot = {
    kind: 'file_snapshot' as const,
    version: 1 as const,
    canonicalPath: '/project/src/a.ts',
    contentHash: 'sha256:before',
    sizeBytes: 12,
    encoding: 'utf8' as const,
    readGeneration: 4,
  }

  it('keeps whole-file, range, and read-only authority distinct', () => {
    const whole = {
      kind: 'whole_file' as const,
      version: 1 as const,
      token: 'whole-token',
      snapshot,
    }
    const range = {
      kind: 'range' as const,
      version: 1 as const,
      token: 'range-token',
      snapshot,
      startLine: 2,
      endLine: 4,
      rangeHash: 'sha256:range',
    }
    const readOnly = {
      kind: 'read_only' as const,
      version: 1 as const,
      token: 'read-token',
      snapshot,
      provenance: 'heuristic' as const,
    }
    const base = {
      canonicalPath: snapshot.canonicalPath,
      baseHash: snapshot.contentHash,
    }

    expect(
      fileCapabilityAuthorizesV1(whole, {
        ...base,
        operation: 'whole_file_update',
      }),
    ).toBe(true)
    expect(
      fileCapabilityAuthorizesV1(range, {
        ...base,
        operation: 'whole_file_update',
      }),
    ).toBe(false)
    expect(
      fileCapabilityAuthorizesV1(range, {
        ...base,
        operation: 'range_update',
        startLine: 2,
        endLine: 4,
      }),
    ).toBe(true)
    expect(
      fileCapabilityAuthorizesV1(range, {
        ...base,
        operation: 'range_update',
        startLine: 2,
        endLine: 5,
      }),
    ).toBe(false)
    expect(
      fileCapabilityAuthorizesV1(readOnly, {
        ...base,
        operation: 'range_update',
        startLine: 2,
        endLine: 4,
      }),
    ).toBe(false)
    expect(
      fileCapabilityAuthorizesV1(whole, {
        ...base,
        baseHash: 'sha256:stale',
        operation: 'delete',
      }),
    ).toBe(false)
  })
})

describe('mutation receipts and reconciliation', () => {
  it('supports every required filesystem error code', () => {
    for (const code of [
      'already_exists',
      'binary',
      'unsupported_encoding',
      'cancelled',
      'malformed_result',
      'stale_state',
      'rollback_incomplete',
      'illegal_transition',
      'unsupported',
    ]) {
      expect(filesystemErrorCodeSchema.safeParse(code).success).toBe(true)
    }
  })

  it('reconstructs applied mutation truth despite a failed lifecycle and malformed handler result', () => {
    const lifecycle = {
      kind: 'tool_lifecycle' as const,
      version: 1 as const,
      callId: 'call-1',
      sequence: 2,
      state: 'failed' as const,
    }
    const reconciled = reconcileFileMutationResultV1({
      lifecycle,
      operationId: 'operation-1',
      handlerResult: 'done',
      receipt: portableReceipt,
    })

    expect(reconciled.lifecycle.state).toBe('failed')
    expect(reconciled.handlerResultValid).toBe(false)
    expect(reconciled.mutation.outcome).toBe('applied')
    expect(reconciled.mutation.receiptId).toBe('receipt-1')
    expect(reconciled.mutation.errors[0]?.code).toBe('malformed_result')
    expect(getConfirmedAppliedActionsV1(reconciled.mutation)).toHaveLength(1)
  })

  it('reconstructs failed plus not_applied when authority proves commit never began', () => {
    const receipt = {
      ...portableReceipt,
      status: 'not_started' as const,
      actions: [
        {
          ...portableReceipt.actions[0],
          status: 'failed' as const,
          afterHash: 'sha256:before',
          error: {
            code: 'stale_state' as const,
            message: 'Expected state changed before commit',
            retryable: true,
            requiresFreshRead: true,
            recovery: 'read_again' as const,
          },
        },
      ],
      finalHashes: { 'src/a.ts': 'sha256:before' },
    }
    const reconciled = reconcileFileMutationResultV1({
      lifecycle: {
        kind: 'tool_lifecycle',
        version: 1,
        callId: 'call-1',
        sequence: 2,
        state: 'failed',
      },
      operationId: 'operation-1',
      handlerResult: { invalid: true },
      receipt,
    })

    expect(reconciled.lifecycle.state).toBe('failed')
    expect(reconciled.mutation.outcome).toBe('not_applied')
    expect(reconciled.mutation.actions[0]?.outcome).toBe('not_applied')
    expect(getConfirmedAppliedActionsV1(reconciled.mutation)).toEqual([])
  })

  it('maps missing authority evidence to unconfirmed and grants no capabilities', () => {
    const reconciled = reconcileFileMutationResultV1({
      lifecycle: {
        kind: 'tool_lifecycle',
        version: 1,
        callId: 'call-1',
        sequence: 2,
        state: 'failed',
      },
      operationId: 'operation-1',
      handlerResult: buildFileMutationResultFromReceiptV1(portableReceipt),
    })

    expect(reconciled.handlerResultValid).toBe(true)
    expect(reconciled.mutation.outcome).toBe('unconfirmed')
    expect(reconciled.mutation.authorityTier).toBeNull()
    expect(reconciled.mutation.freshCapabilities).toEqual([])
    expect(getConfirmedAppliedActionsV1(reconciled.mutation)).toEqual([])
  })

  it('rejects a receipt correlated to a different lifecycle call', () => {
    const reconciled = reconcileFileMutationResultV1({
      lifecycle: {
        kind: 'tool_lifecycle',
        version: 1,
        callId: 'different-call',
        sequence: 2,
        state: 'failed',
      },
      operationId: 'operation-1',
      handlerResult: 'done',
      receipt: portableReceipt,
    })

    expect(reconciled.mutation.outcome).toBe('unconfirmed')
    expect(reconciled.mutation.receiptId).toBeUndefined()
  })

  it('rejects aggregate/action outcome drift and malformed receipts', () => {
    const mutation = buildFileMutationResultFromReceiptV1(portableReceipt)
    expect(
      fileMutationResultV1Schema.safeParse({
        ...mutation,
        outcome: 'not_applied',
      }).success,
    ).toBe(false)
    expect(
      commitReceiptV1Schema.safeParse({
        ...portableReceipt,
        status: 'committed',
        actions: [{ ...portableReceipt.actions[0], status: 'failed' }],
      }).success,
    ).toBe(false)
  })

  it('derives partial, rolled-back, and rollback-incomplete action truth', () => {
    const secondAction = {
      ...portableReceipt.actions[0],
      actionId: 'action-2',
      index: 1,
      path: 'src/b.ts',
      beforeHash: 'sha256:b-before',
      afterHash: 'sha256:b-after',
    }
    const partial = buildFileMutationResultFromReceiptV1({
      ...portableReceipt,
      status: 'failed',
      actions: [
        portableReceipt.actions[0],
        {
          ...secondAction,
          status: 'failed',
          error: {
            code: 'io_error',
            message: 'write failed',
            retryable: true,
          },
        },
      ],
    })
    const rolledBack = buildFileMutationResultFromReceiptV1({
      ...portableReceipt,
      status: 'rolled_back',
      actions: [{ ...portableReceipt.actions[0], status: 'rolled_back' }],
      finalHashes: { 'src/a.ts': 'sha256:before' },
    })
    const rollbackIncomplete = buildFileMutationResultFromReceiptV1({
      ...portableReceipt,
      status: 'rollback_incomplete',
      actions: [
        {
          ...portableReceipt.actions[0],
          status: 'rollback_failed',
          error: {
            code: 'rollback_incomplete',
            message: 'rollback failed',
            retryable: false,
            recovery: 'inspect_rollback',
          },
        },
      ],
    })

    expect(partial.outcome).toBe('partial')
    expect(getConfirmedAppliedActionsV1(partial)).toHaveLength(1)
    expect(rolledBack.outcome).toBe('rolled_back')
    expect(getConfirmedAppliedActionsV1(rolledBack)).toEqual([])
    expect(rollbackIncomplete.outcome).toBe('rollback_incomplete')
    expect(getConfirmedAppliedActionsV1(rollbackIncomplete)).toHaveLength(1)
    expect(rollbackIncomplete.actions[0]?.rollback?.succeeded).toBe(false)
  })
})

describe('proposal state machine', () => {
  const proposal = buildProposalResultV1({
    proposalId: 'proposal-1',
    baseHash: 'sha256:workspace-base',
    operations: [
      {
        actionId: 'action-1',
        index: 0,
        action: 'update',
        path: 'src/a.ts',
        baseHash: 'sha256:before',
        patch: '@@ patch',
      },
    ],
    createdAt: '2026-07-10T00:00:00.000Z',
  })

  it('uses revision/base-hash CAS and keeps accepted distinct from applied', () => {
    const accepted = transitionProposalResultV1(proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 1,
      expectedBaseHash: proposal.baseHash,
      state: 'accepted',
      updatedAt: '2026-07-10T00:01:00.000Z',
    })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.proposal.state).toBe('accepted')
    expect(accepted.proposal.commitReceipt).toBeUndefined()

    const staleRace = transitionProposalResultV1(accepted.proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 1,
      expectedBaseHash: proposal.baseHash,
      state: 'rejected',
      updatedAt: '2026-07-10T00:02:00.000Z',
    })
    expect(staleRace.ok).toBe(false)
    if (!staleRace.ok) expect(staleRace.error.code).toBe('stale_state')

    const applied = transitionProposalResultV1(accepted.proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 2,
      expectedBaseHash: proposal.baseHash,
      state: 'applied',
      updatedAt: '2026-07-10T00:03:00.000Z',
      commitReceipt: portableReceipt,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.proposal.state).toBe('applied')

    const repeated = transitionProposalResultV1(applied.proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 2,
      expectedBaseHash: proposal.baseHash,
      state: 'applied',
      updatedAt: '2026-07-10T00:04:00.000Z',
    })
    expect(repeated).toEqual({
      ok: true,
      proposal: applied.proposal,
      idempotent: true,
    })
  })

  it('rejects conflicting terminal transitions and apply without a receipt', () => {
    const accepted = transitionProposalResultV1(proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 1,
      expectedBaseHash: proposal.baseHash,
      state: 'accepted',
      updatedAt: '2026-07-10T00:01:00.000Z',
    })
    if (!accepted.ok) throw new Error('expected proposal acceptance')

    const noReceipt = transitionProposalResultV1(accepted.proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 2,
      expectedBaseHash: proposal.baseHash,
      state: 'applied',
      updatedAt: '2026-07-10T00:02:00.000Z',
    })
    expect(noReceipt.ok).toBe(false)

    const rejected = transitionProposalResultV1(proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 1,
      expectedBaseHash: proposal.baseHash,
      state: 'rejected',
      updatedAt: '2026-07-10T00:02:00.000Z',
    })
    if (!rejected.ok) throw new Error('expected proposal rejection')
    const conflict = transitionProposalResultV1(rejected.proposal, {
      proposalId: proposal.proposalId,
      expectedRevision: 2,
      expectedBaseHash: proposal.baseHash,
      state: 'accepted',
      updatedAt: '2026-07-10T00:03:00.000Z',
    })
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) expect(conflict.error.code).toBe('illegal_transition')
  })
})
