import { describe, expect, it } from 'bun:test'

import { editTransactionParams } from '../tool/edit-transaction'
import { replaceRangeParams } from '../tool/replace-range'
import {
  encodeReadCapabilityToken,
  getContentHash,
} from '../../../util/content-hash'

describe('range capability edit inputs', () => {
  const hash = getContentHash('- [ ] P6.3 old task')
  const readCapability = encodeReadCapabilityToken({
    startLine: 18,
    endLine: 18,
    hash,
  })

  it('normalizes one readCapability into the complete replace_range target', () => {
    const parsed = replaceRangeParams.inputSchema.parse({
      path: 'PLAN.md',
      readCapability,
      newContent: '- [ ] P6.3 new task',
    })

    expect(parsed).toMatchObject({
      startLine: 18,
      endLine: 18,
      expectedHash: hash,
    })
  })

  it('rejects a capability mixed with conflicting explicit target fields', () => {
    const parsed = replaceRangeParams.inputSchema.safeParse({
      path: 'PLAN.md',
      readCapability,
      startLine: 19,
      endLine: 19,
      expectedHash: hash,
      newContent: '- [ ] P6.3 new task',
    })

    expect(parsed.success).toBe(false)
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
      startLine: 18,
      endLine: 18,
      expectedHash: hash,
    })
  })
})
