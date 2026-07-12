import { describe, expect, test } from 'bun:test'

import { editTransactionParams } from '../params/tool/edit-transaction'
import { strReplaceParams } from '../params/tool/str-replace'

const deletion = {
  oldString: 'obsolete();\n',
  newString: '',
  skipIfMissing: true,
}
const nonDeletion = { ...deletion, newString: 'replacement();\n' }

describe('skipIfMissing schema parity', () => {
  test('accepts deletion-only skipIfMissing in direct and transaction edits', () => {
    expect(
      strReplaceParams.inputSchema.safeParse({
        path: 'src/a.ts',
        replacements: [deletion],
      }).success,
    ).toBe(true)
    expect(
      editTransactionParams.inputSchema.safeParse({
        edits: [
          { type: 'str_replace', path: 'src/a.ts', replacements: [deletion] },
        ],
      }).success,
    ).toBe(true)
  })

  test('rejects skipIfMissing for non-deletion replacements in both tools', () => {
    const direct = strReplaceParams.inputSchema.safeParse({
      path: 'src/a.ts',
      replacements: [nonDeletion],
    })
    const transaction = editTransactionParams.inputSchema.safeParse({
      edits: [
        {
          type: 'str_replace',
          path: 'src/a.ts',
          replacements: [nonDeletion],
        },
      ],
    })

    expect(direct.success).toBe(false)
    expect(transaction.success).toBe(false)
    for (const parsed of [direct, transaction]) {
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain(
          'skipIfMissing is only valid for deletion replacements',
        )
      }
    }
  })
})
