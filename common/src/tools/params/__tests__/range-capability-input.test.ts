import { describe, expect, it } from 'bun:test'

import type { EditTransactionParams, ReplaceRangeParams } from '../../../../../agents/types/tools'

import { editTransactionParams } from '../tool/edit-transaction'
import { replaceRangeParams } from '../tool/replace-range'
import {
  encodeReadCapabilityToken,
  getContentHash,
} from '../../../util/content-hash'

describe('range capability edit inputs', () => {
  const hash = getContentHash(
    '- [ ] P6.2 previous task\n- [ ] P6.3 old task\n- [ ] P6.4 next task',
  )
  const readCapability = encodeReadCapabilityToken({
    startLine: 17,
    endLine: 19,
    hash,
    scope: {
      projectId: '/project',
      path: 'PLAN.md',
      runId: 'run-range-input',
    },
  })

  it('normalizes one readCapability into the complete replace_range target', () => {
    const parsed = replaceRangeParams.inputSchema.parse({
      path: 'PLAN.md',
      readCapability,
      newContent: '- [ ] P6.3 new task',
    })

    expect(parsed).toMatchObject({
      startLine: 17,
      endLine: 19,
      capabilityStartLine: 17,
      capabilityEndLine: 19,
      capabilityHash: hash,
    })
  })

  it('accepts a contained sub-range with one whole-range capability', () => {
    const direct = replaceRangeParams.inputSchema.safeParse({
      path: 'PLAN.md',
      readCapability,
      startLine: 18,
      endLine: 18,
      newContent: '- [ ] P6.3 new task',
    })
    const transaction = editTransactionParams.inputSchema.safeParse({
      edits: [
        {
          type: 'replace_range',
          path: 'PLAN.md',
          readCapability,
          startLine: 18,
          endLine: 18,
          newContent: '- [ ] P6.3 new task',
        },
      ],
    })

    expect(direct.success).toBe(true)
    expect(transaction.success).toBe(true)
  })

  it('rejects target bounds outside the capability range', () => {
    const direct = replaceRangeParams.inputSchema.safeParse({
      path: 'PLAN.md',
      readCapability,
      startLine: 16,
      endLine: 18,
      newContent: '- [ ] P6.3 new task',
    })
    const transaction = editTransactionParams.inputSchema.safeParse({
      edits: [
        {
          type: 'replace_range',
          path: 'PLAN.md',
          readCapability,
          startLine: 18,
          endLine: 20,
          newContent: '- [ ] P6.3 new task',
        },
      ],
    })

    expect(direct.success).toBe(false)
    expect(transaction.success).toBe(false)
  })

  it('rejects cap.v2 replace_range authority at direct and transaction boundaries', () => {
    const legacyCapability =
      'cap.v2.17.19.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

    expect(
      replaceRangeParams.inputSchema.safeParse({
        path: 'PLAN.md',
        readCapability: legacyCapability,
        newContent: '- [ ] P6.3 new task',
      }).success,
    ).toBe(false)
    expect(
      editTransactionParams.inputSchema.safeParse({
        edits: [
          {
            type: 'replace_range',
            path: 'PLAN.md',
            readCapability: legacyCapability,
            newContent: '- [ ] P6.3 new task',
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects removed expectedHash and wholeFileCapabilityHash fields', () => {
    expect(
      replaceRangeParams.inputSchema.safeParse({
        path: 'PLAN.md',
        readCapability,
        expectedHash: hash,
        newContent: '- [ ] P6.3 new task',
      }).success,
    ).toBe(false)
    expect(
      editTransactionParams.inputSchema.safeParse({
        edits: [
          {
            type: 'replace_range',
            path: 'PLAN.md',
            readCapability,
            wholeFileCapabilityHash: hash,
            newContent: '- [ ] P6.3 new task',
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('normalizes capability-only replace_range edits inside transactions', () => {
    const parsed = editTransactionParams.inputSchema.parse({
      edits: [
        {
          path: 'PLAN.md',
          readCapability,
          newContent: '- [ ] P6.3 new task',
        },
      ],
    })

    expect(parsed.edits[0]).toMatchObject({
      type: 'replace_range',
      startLine: 17,
      endLine: 19,
      capabilityStartLine: 17,
      capabilityEndLine: 19,
      capabilityHash: hash,
    })
  })

  it('rejects legacy explicit range tuples at every transaction boundary', () => {
    const legacyInput = {
      edits: [
        {
          type: 'replace_range' as const,
          path: 'PLAN.md',
          startLine: 18,
          endLine: 18,
          expectedHash: hash,
          newContent: '- [ ] P6.3 new task',
        },
      ],
    }

    expect(
      editTransactionParams.inputSchema.safeParse(legacyInput).success,
    ).toBe(false)
    expect(
      editTransactionParams.providerInputSchema?.safeParse(legacyInput).success,
    ).toBe(false)
  })

  it('keeps generated standalone and transaction types in parity', () => {
    const direct: ReplaceRangeParams = {
      path: 'PLAN.md',
      readCapability,
      startLine: 18,
      endLine: 18,
      newContent: '- [ ] P6.3 new task',
    }
    const transaction: EditTransactionParams = {
      edits: [{ type: 'replace_range', ...direct }],
    }

    expect(direct.startLine).toBe(18)
    expect(transaction.edits[0]).toMatchObject({
      type: 'replace_range',
      startLine: 18,
      endLine: 18,
    })
  })

  it('exposes contained cap.v3 range edits to providers', () => {
    const canonicalInput = {
      edits: [
        {
          type: 'replace_range' as const,
          path: 'PLAN.md',
          readCapability,
          startLine: 18,
          endLine: 18,
          newContent: '- [ ] P6.3 new task',
        },
      ],
    }

    expect(
      editTransactionParams.providerInputSchema?.safeParse(canonicalInput)
        .success,
    ).toBe(true)
  })
})
