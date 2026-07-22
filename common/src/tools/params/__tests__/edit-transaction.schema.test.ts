import { describe, expect, it } from 'bun:test'

import { editTransactionParams } from '../tool/edit-transaction'
import {
  decodeReadCapabilityToken,
  encodeReadCapabilityToken,
  getContentHash,
} from '../../../util/content-hash'

// RF-3/RF-8/RF-12/RF-17: replace_range accepts one cap.v3 token. Optional
// target bounds may narrow its covered range; removed legacy hash fields are
// rejected at model-facing transaction boundaries.

describe('editTransactionParams inputSchema transform — whole-file readCapability', () => {
  const issuer = { projectId: '/project', runId: 'run-schema-transform' }
  const path = 'src/file.ts'
  // Mint a whole-file cap.v3 exactly as read_files.renderWholeFileItem would:
  // startLine=1, endLine=split('\n').length of the normalized content, hash
  // over the full normalized content.
  const wholeFileContent = 'line 1\nline 2\nline 3\nline 4\n'
  const wholeFileCap = encodeReadCapabilityToken({
    startLine: 1,
    endLine: 4,
    hash: getContentHash(wholeFileContent),
    scope: { ...issuer, path },
  })
  const decodedWholeFile = decodeReadCapabilityToken(wholeFileCap)
  expect(typeof decodedWholeFile).toBe('object')
  const wholeFileHash =
    typeof decodedWholeFile === 'string' ? '' : decodedWholeFile.hash

  it('accepts contained caller bounds alongside a whole-file readCapability', () => {
    const parsed = editTransactionParams.inputSchema.safeParse({
      edits: [
        {
          type: 'replace_range',
          path,
          readCapability: wholeFileCap,
          startLine: 2,
          endLine: 3,
          newContent: 'replacement',
        },
      ],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.edits[0]).toMatchObject({
      type: 'replace_range',
      startLine: 2,
      endLine: 3,
      capabilityStartLine: 1,
      capabilityEndLine: 4,
      capabilityHash: wholeFileHash,
    })
  })

  it('derives complete bounds and capabilityHash when bounds are omitted', () => {
    const parsed = editTransactionParams.inputSchema.safeParse({
      edits: [
        {
          type: 'replace_range',
          path,
          readCapability: wholeFileCap,
          newContent: 'replacement',
        },
      ],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.edits[0]).toMatchObject({
      type: 'replace_range',
      startLine: 1,
      endLine: 4,
      capabilityStartLine: 1,
      capabilityEndLine: 4,
      capabilityHash: wholeFileHash,
    })
  })

  it('rejects out-of-range bounds and removed hash fields', () => {
    const edit = {
      type: 'replace_range' as const,
      path,
      readCapability: wholeFileCap,
      newContent: 'replacement',
    }

    expect(
      editTransactionParams.inputSchema.safeParse({
        edits: [{ ...edit, startLine: 2, endLine: 5 }],
      }).success,
    ).toBe(false)
    expect(
      editTransactionParams.inputSchema.safeParse({
        edits: [{ ...edit, expectedHash: wholeFileHash }],
      }).success,
    ).toBe(false)
    expect(
      editTransactionParams.inputSchema.safeParse({
        edits: [{ ...edit, wholeFileCapabilityHash: wholeFileHash }],
      }).success,
    ).toBe(false)
  })

  it('accepts scoped cap.v3 and rejects cap.v2 or object basedOnRead anchors', () => {
    const replacement = (basedOnRead: unknown) => ({
      edits: [
        {
          type: 'str_replace' as const,
          path,
          replacements: [
            {
              oldString: 'line 1',
              newString: 'updated line 1',
              basedOnRead,
            },
          ],
        },
      ],
    })

    expect(
      editTransactionParams.inputSchema.safeParse(replacement(wholeFileCap))
        .success,
    ).toBe(true)
    expect(
      editTransactionParams.inputSchema.safeParse(
        replacement(
          'cap.v2.1.4.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        ),
      ).success,
    ).toBe(false)
    expect(
      editTransactionParams.inputSchema.safeParse(
        replacement({ startLine: 1, endLine: 4, hash: wholeFileHash }),
      ).success,
    ).toBe(false)
  })

  it('accepts documented replacement aliases only at the model-facing boundary', () => {
    for (const [oldKey, newKey] of [
      ['old', 'new'],
      ['old_str', 'new_str'],
      ['old_string', 'new_string'],
    ] as const) {
      const input = {
        edits: [
          {
            type: 'str_replace' as const,
            path,
            replacements: [
              { [oldKey]: 'line 1', [newKey]: 'updated line 1' },
            ],
          },
        ],
      }

      const parsed = editTransactionParams.inputSchema.safeParse(input)
      expect(parsed.success).toBe(true)
      if (parsed.success && parsed.data.edits[0].type === 'str_replace') {
        expect(parsed.data.edits[0].replacements).toEqual([
          {
            oldString: 'line 1',
            newString: 'updated line 1',
            allowMultiple: false,
          },
        ])
      }
      expect(editTransactionParams.providerInputSchema.safeParse(input).success).toBe(
        false,
      )
    }
  })

  it('rejects conflicting replacement aliases at the model-facing boundary', () => {
    const input = {
      edits: [
        {
          type: 'str_replace' as const,
          path,
          replacements: [
            {
              oldString: 'line 1',
              old_str: 'different line',
              new: 'updated line 1',
            },
          ],
        },
      ],
    }

    expect(editTransactionParams.inputSchema.safeParse(input).success).toBe(false)
  })

  it('rejects redundant authority fields on str_replace replacements at both schema boundaries', () => {
    const replacement = {
      oldString: 'line 1',
      newString: 'updated line 1',
    }
    const input = (extra: Record<string, unknown>) => ({
      edits: [
        {
          type: 'str_replace' as const,
          path,
          replacements: [{ ...replacement, ...extra }],
        },
      ],
    })

    for (const extra of [
      { expectedHash: wholeFileHash },
      { readCapability: wholeFileCap },
      { wholeFileCapabilityHash: wholeFileHash },
    ]) {
      expect(editTransactionParams.inputSchema.safeParse(input(extra)).success).toBe(
        false,
      )
      expect(
        editTransactionParams.providerInputSchema.safeParse(input(extra)).success,
      ).toBe(false)
    }
  })

  it('signs a whole-file cap.v3 under the capabilityIssuer scope so readCapabilityMatchesScope holds at runtime preflight', () => {
    // Sanity check that the minted token is path/run-bound: the runtime
    // preflight (process-edit-transaction.ts) will reject a capability whose
    // scope does not match { ...readCapabilityIssuer, path: edit.path }.
    // This guards against a future regression that mints pathless bearer
    // tokens for the whole-file sub-range relaxation.
    // Scoped cap.v3 tokens require a canonical sha256: hash (from
    // getContentHash), not a raw content string.
    const scopedWholeFileCap = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 4,
      hash: getContentHash(wholeFileContent),
      scope: { ...issuer, path },
    })
    const decoded = decodeReadCapabilityToken(scopedWholeFileCap)
    expect(typeof decoded).toBe('object')
    if (typeof decoded === 'string') return
    expect(decoded.startLine).toBe(1)
    expect(decoded.endLine).toBe(4)
    expect(decoded.hash).toBe(getContentHash(wholeFileContent))
  })
})
