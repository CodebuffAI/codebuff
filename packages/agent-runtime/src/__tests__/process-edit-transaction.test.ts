import { describe, expect, it } from 'bun:test'
import { applyPatch } from 'diff'

import { processEditTransaction } from '../process-edit-transaction'
import {
  encodeReadCapabilityToken,
  getContentHash,
} from '@codebuff/common/util/content-hash'

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
      const test = result.files.find(
        (file) => file.path === 'src/helper.test.ts',
      )
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
      expect(result.error).toContain('edit_transaction aborted')
      expect(result.error).toContain('during preflight at edit 2 of 2')
      expect(result.error).not.toContain(result.failures[0]!.errorMessage)
      expect(result.error).toContain('NO files were changed')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 1,
          id: 'update-test',
          path: 'src/helper.test.ts',
        }),
      ])
      expect(result.failures[0]!.errorMessage).toContain(
        'Partial success is unavailable inside edit_transaction.',
      )
      expect(result.failures[0]!.errorMessage).not.toContain('omit atomic')
      expect(result.error).not.toContain('+export const value = 2')
    }
  })

  it('skips already-applied deletion edits inside a transaction', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'export const value = 1\n'],
      ['src/helper.test.ts', 'expect(value).toBe(1)\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'already-deleted-debug-log',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'console.log("debug")\n',
              newString: '',
              allowMultiple: false,
              skipIfMissing: true,
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
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/helper.test.ts')
      expect(result.files[0].content).toBe('expect(value).toBe(2)\n')
    }
  })

  it('does not skip missing deletion replacements without an explicit idempotent marker', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'export const value = 1\n'],
      ['src/helper.test.ts', 'expect(value).toBe(1)\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'missing-debug-log',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'console.log("debug")\n',
              newString: '',
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

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('edit_transaction aborted')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 0,
          id: 'missing-debug-log',
          path: 'src/helper.ts',
        }),
      ])
    }
  })

  it('evaluates skipIfMissing in replacement order against evolving content', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'console.log("debug")\nexport const value = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'ordered-skip',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'console.log("debug")\n',
              newString: '',
              allowMultiple: false,
            },
            {
              oldString: 'console.log("debug")\n',
              newString: '',
              allowMultiple: false,
              skipIfMissing: true,
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files[0].content).toBe('export const value = 1\n')
    }
  })

  it('supports occurrenceIndex in transaction str_replace edits', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'const value = 1\nconst value = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'second-occurrence',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const value = 1',
              newString: 'const value = 2',
              allowMultiple: false,
              occurrenceIndex: 2,
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files[0].content).toBe('const value = 1\nconst value = 2\n')
    }
  })

  it('stops preflight at the first failing edit to avoid speculative diagnostics', async () => {
    const initialContentByPath = new Map<string, string | null>([
      ['src/helper.ts', 'export const value = 1\n'],
      ['src/other.ts', 'export const other = 1\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'first-failure',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'missing helper text',
              newString: 'replacement',
              allowMultiple: false,
            },
          ],
        },
        {
          id: 'would-also-fail',
          type: 'str_replace',
          path: 'src/other.ts',
          replacements: [
            {
              oldString: 'missing other text',
              newString: 'replacement',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.failures).toHaveLength(1)
      expect(result.failures[0]).toEqual(
        expect.objectContaining({ editIndex: 0, id: 'first-failure' }),
      )
      expect(result.error).not.toContain('would-also-fail')
    }
  })

  it('does not skip stale replacements just because newString appears elsewhere', async () => {
    const initialContentByPath = new Map<string, string | null>([
      [
        'src/helper.ts',
        'export const alreadyPresent = 2\nexport const current = 3\n',
      ],
      ['src/helper.test.ts', 'expect(value).toBe(1)\n'],
    ])

    const result = await processEditTransaction({
      initialContentByPath,
      logger,
      edits: [
        {
          id: 'stale-helper-update',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'function missingHelper() {\n  return staleValue\n}',
              newString: 'export const alreadyPresent = 2',
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

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('edit_transaction aborted')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 0,
          id: 'stale-helper-update',
          path: 'src/helper.ts',
        }),
      ])
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

  it('dispatches language-native structured imports beyond TypeScript', async () => {
    const cases = [
      {
        path: 'app/service.py',
        initial:
          '"""Service module."""\n\nfrom __future__ import annotations\nfrom app.base import Base\n\nclass Service(Base):\n    pass\n',
        statement: 'from app.models import User',
        expected:
          '"""Service module."""\n\nfrom __future__ import annotations\nfrom app.base import Base\nfrom app.models import User\n\nclass Service(Base):\n    pass\n',
      },
      {
        path: 'app/new_service.py',
        initial: '"""Service module."""\n\nclass Service:\n    pass\n',
        statement: 'from app.models import User',
        expected:
          '"""Service module."""\nfrom app.models import User\n\nclass Service:\n    pass\n',
      },
      {
        path: 'src/lib.rs',
        initial: 'use crate::base::Base;\n\npub fn run() {}\n',
        statement: 'use crate::models::User;',
        expected:
          'use crate::base::Base;\nuse crate::models::User;\n\npub fn run() {}\n',
      },
      {
        path: 'src/new_lib.rs',
        initial:
          '#![forbid(unsafe_code)]\n//! Crate documentation.\n\npub fn run() {}\n',
        statement: 'use crate::models::User;',
        expected:
          '#![forbid(unsafe_code)]\n//! Crate documentation.\nuse crate::models::User;\n\npub fn run() {}\n',
      },
      {
        path: 'cmd/main.go',
        initial: 'package main\n\nfunc main() {}\n',
        statement: 'import "fmt"',
        expected: 'package main\nimport "fmt"\n\nfunc main() {}\n',
      },
      {
        path: 'src/App.java',
        initial: 'package app;\n\npublic class App {}\n',
        statement: 'import app.models.User;',
        expected:
          'package app;\nimport app.models.User;\n\npublic class App {}\n',
      },
      {
        path: 'src/main.cpp',
        initial: '#include "base.h"\n\nint main() {}\n',
        statement: '#include "user.h"',
        expected: '#include "base.h"\n#include "user.h"\n\nint main() {}\n',
      },
      {
        path: 'scripts/player.gd',
        initial: 'extends Node\n\nfunc _ready():\n    pass\n',
        statement: 'const Helpers = preload("res://scripts/helpers.gd")',
        expected:
          'extends Node\nconst Helpers = preload("res://scripts/helpers.gd")\n\nfunc _ready():\n    pass\n',
      },
      {
        path: 'src/App.php',
        initial:
          '<?php\n\n/* bootstrap */\ndeclare(strict_types=1);\n\n// domain namespace\nnamespace App {\n\nfinal class App {}\n}\n',
        statement: 'use App\\Models\\User;',
        expected:
          '<?php\n\n/* bootstrap */\ndeclare(strict_types=1);\n\n// domain namespace\nnamespace App {\nuse App\\Models\\User;\n\nfinal class App {}\n}\n',
      },
    ]

    for (const item of cases) {
      const result = await processEditTransaction({
        initialContentByPath: new Map([[item.path, item.initial]]),
        logger,
        edits: [
          {
            type: 'structured',
            path: item.path,
            operation: {
              kind: 'insert_import',
              importStatement: item.statement,
            },
          },
        ],
      })
      expect('files' in result).toBe(true)
      if ('files' in result) expect(result.files[0].content).toBe(item.expected)
    }
  })

  it('inserts and removes imports inside an existing Go import block', async () => {
    const initial = [
      'package main',
      '',
      'import (',
      '\t"os"',
      ')',
      '',
      'func main() {}',
      '',
    ].join('\n')
    const inserted = await processEditTransaction({
      initialContentByPath: new Map([['cmd/main.go', initial]]),
      logger,
      edits: [
        {
          type: 'structured',
          path: 'cmd/main.go',
          operation: { kind: 'insert_import', importStatement: 'import "fmt"' },
        },
      ],
    })
    expect('files' in inserted).toBe(true)
    if (!('files' in inserted)) return
    expect(inserted.files[0].content).toContain('import (\n\t"os"\n\t"fmt"\n)')

    const removed = await processEditTransaction({
      initialContentByPath: new Map([
        ['cmd/main.go', inserted.files[0].content],
      ]),
      logger,
      edits: [
        {
          type: 'structured',
          path: 'cmd/main.go',
          operation: { kind: 'remove_import', moduleSpecifier: 'os' },
        },
      ],
    })
    expect('files' in removed).toBe(true)
    if ('files' in removed) {
      expect(removed.files[0].content).not.toContain('"os"')
      expect(removed.files[0].content).toContain('"fmt"')
    }
  })

  it('aborts when structured insert_import would be a no-op duplicate', async () => {
    const initialContentByPath = new Map<string, string | null>([
      [
        'src/helper.ts',
        "import { value } from './value'\n\nexport { value }\n",
      ],
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
      expect(result.error).toContain('edit_transaction aborted')
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
      [
        'src/helper.ts',
        "import { value } from './value'\n\nexport { value }\n",
      ],
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
      expect(applyPatch('const value = 1\n', result.files[0].patch)).toBe(
        'export const value = 2\n',
      )
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
      expect(result.error).toContain('edit_transaction aborted')
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
      expect(result.error).toContain('edit_transaction aborted')
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

  it('coalesces adjacent same-file str_replace edits so original anchors survive line shifts', async () => {
    const initialContent = 'const a = 1\nconst b = 1\n'
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/helper.ts', initialContent]]),
      logger,
      edits: [
        {
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const a = 1',
              newString: 'const a = 1\nconst inserted = true',
              allowMultiple: false,
              basedOnRead: {
                startLine: 1,
                endLine: 1,
                hash: getContentHash('const a = 1'),
              },
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
              basedOnRead: {
                startLine: 2,
                endLine: 2,
                hash: getContentHash('const b = 1'),
              },
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].content).toBe(
        'const a = 1\nconst inserted = true\nconst b = 2\n',
      )
    }
  })

  it("coalesces id'd adjacent same-file str_replace edits so original anchors survive line shifts", async () => {
    const initialContent = 'const a = 1\nconst b = 1\n'
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/helper.ts', initialContent]]),
      logger,
      edits: [
        {
          id: 'insert-before-second-anchor',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const a = 1',
              newString: 'const a = 1\nconst inserted = true',
              allowMultiple: false,
              basedOnRead: {
                startLine: 1,
                endLine: 1,
                hash: getContentHash('const a = 1'),
              },
            },
          ],
        },
        {
          id: 'update-shifted-anchor',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const b = 1',
              newString: 'const b = 2',
              allowMultiple: false,
              basedOnRead: {
                startLine: 2,
                endLine: 2,
                hash: getContentHash('const b = 1'),
              },
            },
          ],
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].content).toBe(
        'const a = 1\nconst inserted = true\nconst b = 2\n',
      )
    }
  })

  it('reports the later edit id when an adjacent same-file str_replace fails', async () => {
    const result = await processEditTransaction({
      initialContentByPath: new Map([
        ['src/helper.ts', 'const a = 1\nconst b = 1\n'],
      ]),
      logger,
      edits: [
        {
          id: 'first-update',
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
          id: 'second-update',
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const missing = 1',
              newString: 'const missing = 2',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('during preflight at edit 2 of 2')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 1,
          id: 'second-update',
          path: 'src/helper.ts',
        }),
      ])
    }
  })

  it("reports the later edit index when a coalesced un-id'd str_replace fails", async () => {
    const result = await processEditTransaction({
      initialContentByPath: new Map([
        ['src/helper.ts', 'const a = 1\nconst b = 1\n'],
      ]),
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
              oldString: 'const missing = 1',
              newString: 'const missing = 2',
              allowMultiple: false,
            },
          ],
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('during preflight at edit 2 of 2')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 1,
          path: 'src/helper.ts',
          errorMessage: expect.stringContaining('Replacement 2'),
        }),
      ])
    }
  })

  it('does not coalesce same-file str_replace edits across other edit types', async () => {
    const initialContent = 'const a = 1\nconst b = 1\nconst c = 1\n'
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/helper.ts', initialContent]]),
      logger,
      edits: [
        {
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const a = 1',
              newString: 'const a = 1\nconst inserted = true',
              allowMultiple: false,
              basedOnRead: {
                startLine: 1,
                endLine: 1,
                hash: getContentHash('const a = 1'),
              },
            },
          ],
        },
        {
          type: 'replace_range',
          path: 'src/helper.ts',
          startLine: 3,
          endLine: 3,
          expectedHash: getContentHash('const b = 1'),
          newContent: 'const b = 2',
        },
        {
          type: 'str_replace',
          path: 'src/helper.ts',
          replacements: [
            {
              oldString: 'const c = 1',
              newString: 'const c = 2',
              allowMultiple: false,
              basedOnRead: {
                startLine: 3,
                endLine: 3,
                hash: getContentHash('const c = 1'),
              },
            },
          ],
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.failures[0]).toEqual(
        expect.objectContaining({
          editIndex: 2,
          path: 'src/helper.ts',
        }),
      )
      expect(result.failures[0]?.errorMessage).toContain('basedOnRead')
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
      expect(result.error).toContain('edit_transaction aborted')
      expect(result.failures[0]?.errorMessage).toContain(
        'oldString was not uniquely identifiable',
      )
    }
  })

  it('shifts a later non-overlapping replace_range from the original snapshot', async () => {
    const initial = 'one\ntwo\nthree\n'
    const issuer = { projectId: '/project', runId: 'range-shift' }
    const rangeCapability = (startLine: number, endLine: number, content: string) =>
      encodeReadCapabilityToken({
        startLine,
        endLine,
        hash: getContentHash(content),
        scope: { ...issuer, path: 'src/file.ts' },
      })
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/file.ts', initial]]),
      logger,
      readCapabilityIssuer: issuer,
      edits: [
        {
          type: 'replace_range',
          path: 'src/file.ts',
          startLine: 1,
          endLine: 1,
          expectedHash: getContentHash('one'),
          readCapability: rangeCapability(1, 1, 'one'),
          newContent: 'ONE\nINSERTED',
        },
        {
          type: 'replace_range',
          path: 'src/file.ts',
          startLine: 3,
          endLine: 3,
          expectedHash: getContentHash('three'),
          readCapability: rangeCapability(3, 3, 'three'),
          newContent: 'THREE',
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files[0].content).toBe('ONE\nINSERTED\ntwo\nTHREE\n')
    }
  })

  it('rejects overlapping sequential replace_ranges from the original snapshot', async () => {
    const initial = 'one\ntwo\nthree\n'
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/file.ts', initial]]),
      logger,
      edits: [
        {
          type: 'replace_range',
          path: 'src/file.ts',
          startLine: 1,
          endLine: 2,
          expectedHash: getContentHash('one\ntwo'),
          newContent: 'ONE\nTWO\nINSERTED',
        },
        {
          type: 'replace_range',
          path: 'src/file.ts',
          startLine: 2,
          endLine: 3,
          expectedHash: getContentHash('two\nthree'),
          newContent: 'TWO\nTHREE',
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.failures[0]).toEqual(
        expect.objectContaining({ editIndex: 1, path: 'src/file.ts' }),
      )
      expect(result.failures[0]?.errorMessage).toContain('overlap a prior replace_range')
    }
  })

  it('composes range, patch, and whole-file transaction primitives', async () => {
    const initial = 'one\ntwo\nthree\n'
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/file.ts', initial]]),
      logger,
      edits: [
        {
          type: 'replace_range',
          path: 'src/file.ts',
          startLine: 2,
          endLine: 2,
          expectedHash: getContentHash('two'),
          newContent: 'TWO',
        },
        {
          type: 'patch',
          path: 'src/file.ts',
          diff: '@@ -1,3 +1,3 @@\n-one\n+ONE\n TWO\n three\n',
        },
        {
          type: 'write_file',
          path: 'src/file.ts',
          content: 'final\n',
        },
      ],
    })

    expect('files' in result ? result.files[0]?.content : null).toBe('final\n')
  })

  it('aborts replace_range edits with reversed line bounds', async () => {
    const initial = 'one\ntwo\nthree\n'
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/file.ts', initial]]),
      logger,
      edits: [
        {
          type: 'replace_range',
          path: 'src/file.ts',
          startLine: 3,
          endLine: 2,
          expectedHash: getContentHash(''),
          newContent: 'inserted',
        },
      ],
    })

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('edit_transaction aborted')
      expect(result.failures).toEqual([
        expect.objectContaining({
          editIndex: 0,
          path: 'src/file.ts',
          errorMessage: expect.stringContaining('replace_range 3-2 is outside'),
        }),
      ])
    }
  })

  it('creates a preloaded missing file with write_file', async () => {
    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/new.ts', null]]),
      logger,
      edits: [
        {
          type: 'write_file',
          path: 'src/new.ts',
          content: 'export const created = true\n',
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/new.ts')
      expect(result.files[0].content).toBe('export const created = true\n')
      expect(result.files[0].patch).toContain('+export const created = true')
      expect(applyPatch('', result.files[0].patch)).toBe(
        'export const created = true\n',
      )
    }
  })

  it('rewrite_symbol replaces the contiguous preceding documentation comment', async () => {
    const result = await processEditTransaction({
      initialContentByPath: new Map([
        [
          'src/file.ts',
          '/** Old documentation. */\nexport function target() {\n  return 1\n}\n',
        ],
      ]),
      logger,
      edits: [
        {
          type: 'rewrite_symbol',
          path: 'src/file.ts',
          symbol: 'target',
          content:
            '/** New documentation. */\nexport function target() {\n  return 2\n}',
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files[0].content).toContain('/** New documentation. */')
      expect(result.files[0].content).not.toContain('Old documentation')
      expect(result.files[0].content).toContain('return 2')
    }
  })

  it('applies a whole-file readCapability + narrower sub-range replace_range without an expectedHash match', async () => {
    // RF-1/RF-10: the wholeFileCapabilitySubRange preflight branch verifies
    // decoded.hash against the whole-file hash and applies the caller's
    // narrower sub-range WITHOUT an expectedHash match (the security-critical
    // relaxation). Mint a fresh whole-file cap.v3 matching exactly what
    // read_files.renderWholeFileItem would mint over lines 1-N of a file
    // ending in a trailing newline (endLine = split('\n').length, hash over
    // the full normalized content).
    const initial = 'export const value = 1\nexport const other = 2\n'
    const issuer = { projectId: '/project', runId: 'run-wholefile-subrange' }
    const wholeFileCap = encodeReadCapabilityToken({
      startLine: 1,
      endLine: initial.split('\n').length,
      hash: getContentHash(initial),
      scope: { ...issuer, path: 'src/helper.ts' },
    })

    const result = await processEditTransaction({
      initialContentByPath: new Map([['src/helper.ts', initial]]),
      logger,
      readCapabilityIssuer: issuer,
      edits: [
        {
          id: 'whole-file-cap-subrange',
          type: 'replace_range',
          path: 'src/helper.ts',
          readCapability: wholeFileCap,
          startLine: 2,
          endLine: 2,
          // edit.expectedHash is intentionally omitted: the transform emits
          // { expectedHash: undefined, wholeFileCapabilityHash: decoded.hash },
          // and the runtime preflight verifies decoded.hash against the
          // current whole-file hash instead of a per-range hash match.
          newContent: 'export const other = 22',
        },
      ],
    })

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].content).toBe(
        'export const value = 1\nexport const other = 22\n',
      )
      expect(result.files[0].messages).toContain(
        'Replaced lines 2-2 in src/helper.ts using a whole-file readCapability.',
      )
      expect(applyPatch(initial, result.files[0].patch)).toBe(
        'export const value = 1\nexport const other = 22\n',
      )
    }
  })

  it('rejects a stale whole-file capability without granting retry authority', async () => {
    const staleInitial = 'export const value = 1\nexport const other = 2\n'
    const currentInitial = 'export const value = 99\nexport const other = 2\n'
    const issuer = { projectId: '/project', runId: 'run-wholefile-stale' }
    const staleWholeFileCap = encodeReadCapabilityToken({
      startLine: 1,
      endLine: staleInitial.split('\n').length,
      hash: getContentHash(staleInitial),
      scope: { ...issuer, path: 'src/helper.ts' },
    })
    const request = {
      initialContentByPath: new Map([['src/helper.ts', currentInitial]]),
      logger,
      readCapabilityIssuer: issuer,
      edits: [
        {
          id: 'whole-file-cap-subrange-stale',
          type: 'replace_range' as const,
          path: 'src/helper.ts',
          readCapability: staleWholeFileCap,
          startLine: 2,
          endLine: 2,
          newContent: 'export const other = 22',
        },
      ],
    }

    const result = await processEditTransaction(request)

    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toContain('edit_transaction aborted')
    expect(result.failures).toEqual([
      expect.objectContaining({
        editIndex: 0,
        id: 'whole-file-cap-subrange-stale',
        path: 'src/helper.ts',
      }),
    ])
    const message = result.failures[0]!.errorMessage
    expect(message).toContain(
      'the whole-file readCapability is stale (its hash no longer matches the current full-file content)',
    )
    expect(message).toContain('Re-read the file (read_files.paths)')
    expect(message).not.toContain('Recovery capability')
    expect(message).not.toContain('readCapability="')
    expect(message).not.toContain('retry replace_range DIRECTLY')
    expect(message).not.toContain('no extra read_files round-trip required')
    expect(message).not.toContain('cap.v3.')

    const retry = await processEditTransaction(request)
    expect('error' in retry).toBe(true)
    if ('error' in retry) {
      expect(retry.failures[0]!.errorMessage).toBe(message)
    }
  })

  it('rejects a stale exact-range capability without granting retry authority', async () => {
    const staleRange = 'export const value = 1'
    const currentInitial = 'export const value = 99\nexport const other = 2\n'
    const issuer = { projectId: '/project', runId: 'run-range-stale' }
    const staleRangeCap = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 1,
      hash: getContentHash(staleRange),
      scope: { ...issuer, path: 'src/helper.ts' },
    })
    const request = {
      initialContentByPath: new Map([['src/helper.ts', currentInitial]]),
      logger,
      readCapabilityIssuer: issuer,
      edits: [
        {
          id: 'exact-range-cap-stale',
          type: 'replace_range' as const,
          path: 'src/helper.ts',
          readCapability: staleRangeCap,
          startLine: 1,
          endLine: 1,
          expectedHash: getContentHash(staleRange),
          newContent: 'export const value = 2',
        },
      ],
    }

    const result = await processEditTransaction(request)

    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    const message = result.failures[0]!.errorMessage
    expect(message).toContain('expectedHash is stale')
    expect(message).toContain('Re-read lines 1-1')
    expect(message).not.toContain('Recovery capability')
    expect(message).not.toContain('readCapability="')
    expect(message).not.toContain('retry replace_range DIRECTLY')
    expect(message).not.toContain('no extra read_files round-trip required')
    expect(message).not.toContain('cap.v3.')

    const retry = await processEditTransaction(request)
    expect('error' in retry).toBe(true)
    if ('error' in retry) {
      expect(retry.failures[0]!.errorMessage).toBe(message)
    }
  })
})
