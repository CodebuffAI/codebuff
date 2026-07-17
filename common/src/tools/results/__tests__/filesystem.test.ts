import { describe, expect, it } from 'bun:test'

import {
  buildFileMutationResultFromReceiptV1,
  buildNativeToolResultErrorOutputV1,
  buildReadFilesResultV1,
  canTransitionToolLifecycleV1,
  commitReceiptV1Schema,
  fileCapabilityAuthorizesV1,
  fileMutationResultV1Schema,
  filesystemErrorCodeSchema,
  getConfirmedAppliedActionsV1,
  isReadFilesResultV1,
  nativeToolResultErrorOutputV1Schema,
  readFilesResultV1Schema,
  reconcileFileMutationResultV1,
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

  it('allows whole-file capabilities only on complete reads', () => {
    const complete = buildReadFilesResultV1([
      {
        selector: 'file',
        requestIndex: 0,
        path: 'src/a.ts',
        status: 'ok',
        content: 'a',
        complete: true,
        template: false,
        readCapability: 'cap.v2.1.1.example',
      },
    ])
    expect(readFilesResultV1Schema.safeParse(complete).success).toBe(true)

    expect(
      readFilesResultV1Schema.safeParse({
        kind: 'read_files_result',
        version: 1,
        status: 'partial',
        summary: {
          requested: 1,
          ok: 0,
          partial: 1,
          failed: 0,
          uniquePaths: 1,
        },
        results: [
          {
            selector: 'file',
            requestIndex: 0,
            path: 'src/a.ts',
            status: 'partial',
            content: 'a',
            complete: false,
            template: false,
            readCapability: 'cap.v2.1.1.example',
            truncation: { reason: 'character_limit' },
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('keeps structured edit anchors coherent with legacy capability fields', () => {
    const contentHash = `sha256:${'a'.repeat(64)}`
    const valid = buildReadFilesResultV1([
      {
        selector: 'range',
        requestIndex: 0,
        path: 'src/a.ts',
        status: 'ok',
        content: '1\ta',
        sourceContent: 'a',
        startLine: 1,
        endLine: 1,
        totalLines: 1,
        complete: true,
        rangeHash: contentHash,
        readCapability: 'cap.v3.example',
        editAnchor: {
          startLine: 1,
          endLine: 1,
          contentHash,
          readCapability: 'cap.v3.example',
        },
      },
    ])
    expect(readFilesResultV1Schema.safeParse(valid).success).toBe(true)

    const range = valid.results[0]
    expect(range?.selector).toBe('range')
    if (!range || range.selector !== 'range' || range.status === 'error') {
      throw new Error('expected one successful range result')
    }
    expect(
      readFilesResultV1Schema.safeParse({
        ...valid,
        results: [
          {
            ...range,
            editAnchor: { ...range.editAnchor, startLine: 2 },
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('accepts model-visible edit anchors without legacy duplicate fields', () => {
    const contentHash = `sha256:${'b'.repeat(64)}`
    const result = buildReadFilesResultV1([
      {
        selector: 'range',
        requestIndex: 0,
        path: 'src/a.ts',
        status: 'ok',
        content: '1\ta',
        sourceContent: 'a',
        startLine: 1,
        endLine: 1,
        totalLines: 1,
        complete: true,
        editAnchor: {
          startLine: 1,
          endLine: 1,
          contentHash,
          readCapability: 'cap.v3.example',
        },
      },
    ])

    expect(readFilesResultV1Schema.safeParse(result).success).toBe(true)
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
