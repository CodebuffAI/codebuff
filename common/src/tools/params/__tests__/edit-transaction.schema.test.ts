import { describe, expect, it } from 'bun:test'

import { editTransactionParams } from '../tool/edit-transaction'
import {
  decodeReadCapabilityToken,
  encodeReadCapabilityToken,
  getContentHash,
} from '../../../util/content-hash'

// RF-2/RF-11: the editTransactionParams inputSchema `.transform` is the sole
// producer of the `wholeFileCapabilityHash` field consumed by the runtime. A
// regression here (e.g. emitting expectedHash instead of
// wholeFileCapabilityHash, or dropping the caller's narrower bounds) would
// silently let edits through with the wrong freshness check.

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
    hash: wholeFileContent,
  })
  const decodedWholeFile = decodeReadCapabilityToken(wholeFileCap)
  expect(typeof decodedWholeFile).toBe('object')
  const wholeFileHash =
    typeof decodedWholeFile === 'string' ? '' : decodedWholeFile.hash

  it('emits { expectedHash: undefined, wholeFileCapabilityHash: decoded.hash, startLine, endLine } when a whole-file readCapability is combined with narrower caller bounds', () => {
    const parsed = editTransactionParams.inputSchema.safeParse({
      edits: [
        {
          type: 'replace_range',
          path,
          readCapability: wholeFileCap,
          startLine: 2,
          endLine: 4,
          newContent: 'replacement',
        },
      ],
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const edit = parsed.data.edits[0]!
    expect(edit.type).toBe('replace_range')
    if (edit.type !== 'replace_range') return
    // The caller's narrower bounds are preserved verbatim.
    expect(edit.startLine).toBe(2)
    expect(edit.endLine).toBe(4)
    // expectedHash MUST be undefined — the runtime preflight verifies the
    // whole-file hash against current content, not a per-range hash match.
    expect(edit.expectedHash).toBeUndefined()
    // wholeFileCapabilityHash carries decoded.hash so the runtime can confirm
    // the caller supplied a whole-file capability attesting the file they saw.
    expect(edit.wholeFileCapabilityHash).toBe(wholeFileHash)
    expect(edit.wholeFileCapabilityHash).not.toBeUndefined()
  })

  it('emits { expectedHash: decoded.hash, startLine/endLine from the capability, wholeFileCapabilityHash: undefined } when a whole-file readCapability is supplied alone', () => {
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
    const edit = parsed.data.edits[0]!
    expect(edit.type).toBe('replace_range')
    if (edit.type !== 'replace_range') return
    // Without caller-supplied bounds, the transform derives startLine/endLine
    // from the decoded capability itself.
    expect(edit.startLine).toBe(1)
    expect(edit.endLine).toBe(4)
    // expectedHash carries decoded.hash; the runtime verifies it against the
    // current sub-range hash (the original strict path).
    expect(edit.expectedHash).toBe(wholeFileHash)
    // No wholeFileCapabilityHash is emitted — the capability's bounds equal
    // the requested range, so the whole-file-sub-range relaxation does NOT
    // apply.
    expect(edit.wholeFileCapabilityHash).toBeUndefined()
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
