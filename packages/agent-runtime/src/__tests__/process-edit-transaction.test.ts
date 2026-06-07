import { describe, expect, it } from 'bun:test'
import { applyPatch } from 'diff'

import { processEditTransaction } from '../process-edit-transaction'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('processEditTransaction', () => {
  it('preflights and returns patches for multiple files when every edit succeeds', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'export const value = 1\n'],
      ['src/helper.test.ts', 'expect(value).toBe(1)\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'update-helper',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 2',
              allowMultiple: false,
            },
          ],
        },
        {
          id: 'update-test',
          type: 'str_replace',
          path: 'src/helper.test.ts',
          replacements: [
            {
              oldString: 'expect(value).toBe(1)',
              newString: 'expect(value).toBe(2)',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(2)
      const helper = result.files.find((file) => file.path === 'src/helper.ts')
      const test = result.files.find((file) => file.path === 'src/helper.test.ts')
      expect(helper?.content).toBe('export const value = 2\n')
      expect(test?.content).toBe('expect(value).toBe(2)\n')
      expect(applyPatch('export const value = 1\n', helper!.patch)).toBe(
        'export const value = 2\n',
      )
      expect(applyPatch('expect(value).toBe(1)\n', test!.patch)).toBe(
        'expect(value).toBe(2)\n',
      )
    }
  })

  it('aborts the whole transaction when any file edit fails', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'export const value = 1\n'],
      ['src/helper.test.ts', 'expect(value).toBe(1)\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'update-helper',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 2',
              allowMultiple: false,
            },
          ],
        },
        {
          id: 'update-test',
          type: 'str_replace',
          path: 'src/helper.test.ts',
          replacements: [
            {
              oldString: 'expect(value).toBe(999999999999999999999)',
              newString: 'expect(value).toBe(2)',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Atomic edit_transaction aborted')
      expect(result.error).toContain('NO files were changed')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 1,
          id: 'update-test',
          path: 'src/helper.test.ts',
        }),
      ])
      expect(result.error).not.toContain('+export const value = 2')
    }
  })

  it('dispatches structured insert_text edits inside a transaction', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'const value = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'insert-export',
          type: 'structured',
          path: 'src/helper.ts',
          operation: {
            kind: 'insert_text',
            position: { line: 1, column: 1 },
            text: 'export ',
          },
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].content).toBe('export const value = 1\n')
      expect(result.files[0].messages).toContain(
        'Applied structured insert_text at src/helper.ts:1:1.',
      )
      expect(applyPatch('const value = 1\n', result.files[0].patch)).toBe(
        'export const value = 1\n',
      )
    }
  })

  it('dispatches structured insert_import edits inside a transaction', async () => {
    const initialContentByPath = new Map<string, string | null>([
      [
        'src/helper.ts',
        "import { existing } from './existing'\n\nexport const value = existing\n",
      ],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'insert-import',
          type: 'structured',
          path: 'src/helper.ts',
          operation: {
            kind: 'insert_import',
            importStatement: "import { added } from './added'",
          },
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files[0].content).toBe(
        "import { existing } from './existing'\nimport { added } from './added'\n\nexport const value = existing\n",
      )
      expect(result.files[0].messages).toContain(
        'Applied structured insert_import in src/helper.ts.',
      )
    }
  })

  it('dispatches structured remove_import edits inside a transaction', async () => {
    const initialContentByPath = new Map<string, string | null>([
      [
        'src/helper.ts',
        "import { unused } from './unused'\nimport { used } from './used'\n\nexport const value = used\n",
      ],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'remove-import',
          type: 'structured',
          path: 'src/helper.ts',
          operation: {
            kind: 'remove_import',
            moduleSpecifier: './unused',
          },
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files[0].content).toBe(
        "import { used } from './used'\n\nexport const value = used\n",
      )
      expect(result.files[0].messages).toContain(
        'Applied structured remove_import in src/helper.ts.',
      )
    }
  })

  it('aborts when structured insert_import would be a no-op duplicate', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', "import { value } from './value'\n\nexport { value }\n"],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'duplicate-import',
          type: 'structured',
          path: 'src/helper.ts',
          operation: {
            kind: 'insert_import',
            importStatement: "import { value } from './value'",
          },
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Atomic edit_transaction aborted')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 0,
          id: 'duplicate-import',
          path: 'src/helper.ts',
          errorMessage: expect.stringContaining('import already exists'),
        }),
      ])
    }
  })

  it('aborts invalid structured remove_import payloads at runtime', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', "import { value } from './value'\n\nexport { value }\n"],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'invalid-remove-import',
          type: 'structured',
          path: 'src/helper.ts',
          operation: {
            kind: 'remove_import',
          },
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 0,
          id: 'invalid-remove-import',
          path: 'src/helper.ts',
          errorMessage: expect.stringContaining(
            'provide importStatement or moduleSpecifier',
          ),
        }),
      ])
    }
  })

  it('chains structured and str_replace edits to the same file in memory', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'const value = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          type: 'structured',
          path: 'src/helper.ts',
          operation: {
            kind: 'insert_text',
            position: { line: 1, column: 1 },
            text: 'export ',
          },
        },
        {
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'value = 1',
              newString: 'value = 2',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].content).toBe('export const value = 2\n')
      expect(
        applyPatch('const value = 1\n', result.files[0].patch),
      ).toBe('export const value = 2\n')
    }
  })

  it('aborts the whole transaction when a structured edit fails', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'const value = 1\n'],
      ['src/other.ts', 'const other = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'value = 1',
              newString: 'value = 2',
              allowMultiple: false,
            },
          ],
        },
        {
          id: 'bad-insert',
          type: 'structured',
          path: 'src/other.ts',
          operation: {
            kind: 'insert_text',
            position: { line: 99, column: 1 },
            text: 'export ',
          },
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Atomic edit_transaction aborted')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 1,
          id: 'bad-insert',
          path: 'src/other.ts',
        }),
      ])
    }
  })

  it('aborts when an edit path was not preloaded for transaction preflight', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'const value = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'missing-file',
          type: 'structured',
          path: 'src/missing.ts',
          operation: {
            kind: 'insert_text',
            position: { line: 1, column: 1 },
            text: 'export ',
          },
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Atomic edit_transaction aborted')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 0,
          id: 'missing-file',
          path: 'src/missing.ts',
          errorMessage: expect.stringContaining('file was not preloaded'),
        }),
      ])
    }
  })

  it('chains multiple edits to the same file in memory before producing one patch', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'const a = 1\nconst b = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const a = 1',
              newString: 'const a = 2',
              allowMultiple: false,
            },
          ],
        },
        {
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const b = 1',
              newString: 'const b = 2',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].content).toBe('const a = 2\nconst b = 2\n')
      expect(
        applyPatch('const a = 1\nconst b = 1\n', result.files[0].patch),
      ).toBe('const a = 2\nconst b = 2\n')
    }
  })

  it('preflights large-file str_replace without basedOnRead when oldString is unique', async () => {
    const initialContent = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    ).join('\n')
    const initialContentByPath = new Map<string, string | null>([
      ['src/large.ts', initialContent],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          type: 'str_replace',
          path: 'src/large.ts',
          replacements: [
            {
              oldString: 'const target = 1;',
              newString: 'const target = 2;',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].content).toContain('const target = 2;')
      expect(result.files[0].content).not.toContain('const target = 1;')
      expect(
        result.files[0].messages.some((message) =>
          message.includes('deterministic oldString match'),
        ),
      ).toBe(true)
    }
  })

  it('aborts large-file transaction when oldString is ambiguous without basedOnRead', async () => {
    const initialContent = Array.from({ length: 1_001 }, (_, index) =>
      index === 300 || index === 700
        ? 'const target = 1;'
        : `const filler${index} = ${index};`,
    ).join('\n')
    const initialContentByPath = new Map<string, string | null>([
      ['src/large.ts', initialContent],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          type: 'str_replace',
          path: 'src/large.ts',
          replacements: [
            {
              oldString: 'const target = 1;',
              newString: 'const target = 2;',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Atomic edit_transaction aborted')
      expect(result.error).toContain('oldString was not uniquely identifiable')
    }
  })
})
