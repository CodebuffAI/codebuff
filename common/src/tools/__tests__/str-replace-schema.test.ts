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

describe('replacement placeholder recovery', () => {
  test('drops a trailing operation-less replacement in direct and transaction edits', () => {
    const validReplacement = {
      oldString: 'const value = 1',
      newString: 'const value = 2',
    }
    const direct = strReplaceParams.inputSchema.safeParse({
      path: 'server/src/services/ip.ts',
      replacements: [validReplacement, {}, { allowMultiple: false }],
    })
    const transaction = editTransactionParams.inputSchema.safeParse({
      edits: [
        {
          type: 'str_replace',
          path: 'server/src/services/ip.ts',
          replacements: [validReplacement, {}],
        },
      ],
    })

    expect(direct.success).toBe(true)
    if (direct.success) {
      expect(direct.data.replacements).toEqual([
        { ...validReplacement, allowMultiple: false },
      ])
    }
    expect(transaction.success).toBe(true)
    if (transaction.success) {
      expect(transaction.data.edits[0]).toMatchObject({
        type: 'str_replace',
        replacements: [{ ...validReplacement, allowMultiple: false }],
      })
    }
  })

  test('still rejects one-sided or unknown replacement objects', () => {
    for (const replacement of [
      { oldString: 'const value = 1' },
      { newString: 'const value = 2' },
      { oldStrng: 'misspelled', newStrng: 'misspelled' },
    ]) {
      expect(
        strReplaceParams.inputSchema.safeParse({
          path: 'src/a.ts',
          replacements: [replacement],
        }).success,
      ).toBe(false)
    }
  })

  test('rejects a batch that contains only empty placeholders', () => {
    expect(
      strReplaceParams.inputSchema.safeParse({
        path: 'src/a.ts',
        replacements: [{}, { allowMultiple: false }],
      }).success,
    ).toBe(false)
  })
})

describe('transaction edit-array coercion', () => {
  test('accepts a JSON-stringified edits array', () => {
    const edits = [
      {
        id: 'sanitize-ip-package-filename',
        path: 'server/src/http/fileRoutes.ts',
        type: 'str_replace',
        replacements: [
          {
            oldString: 'const downloadName = title',
            newString: 'const downloadName = sanitize(title)',
          },
        ],
      },
    ]
    const parsed = editTransactionParams.inputSchema.safeParse({
      edits: JSON.stringify(edits),
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.edits).toEqual([
        {
          ...edits[0],
          replacements: [
            {
              ...edits[0]!.replacements[0],
              allowMultiple: false,
            },
          ],
        },
      ])
    }
  })

  test('accepts double-stringified arrays with stringified edit entries', () => {
    const edit = {
      id: 'marketing-head',
      path: 'client/src/routes/_index/index.lazy.tsx',
      type: 'str_replace',
      replacements: [
        {
          oldString: 'component: HomePage,',
          newString: 'component: HomePage,\nhead: () => ({ meta: [] }),',
        },
      ],
    }
    const parsed = editTransactionParams.inputSchema.safeParse({
      edits: JSON.stringify(JSON.stringify([JSON.stringify(edit)])),
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.edits[0]).toMatchObject({
        id: 'marketing-head',
        type: 'str_replace',
        path: edit.path,
      })
    }
  })

  test('still rejects a non-JSON edits string', () => {
    expect(
      editTransactionParams.inputSchema.safeParse({
        edits: 'not a JSON edit array',
      }).success,
    ).toBe(false)
  })
})
