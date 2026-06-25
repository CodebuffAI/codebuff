import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

type ExtractChangedFilesFromMessages = (
  messages: unknown,
  startIndex: number,
) => string[]

type InlineChangedFileHelpers = {
  extractChangedFilesFromMessages: ExtractChangedFilesFromMessages
}

type InlineHelperFactory = (processValue: typeof process) => InlineChangedFileHelpers

const INLINE_HELPER_NAMES = [
  'extractChangedFilesFromMessages',
  'visitToolValue',
  'collectToolInputFiles',
  'isFileChangingTool',
  'hasEditArtifact',
  'normalizeGateFileList',
  'normalizeGateFilePath',
] as const

function extractInlineFunctionSource(
  source: string,
  functionName: string,
): string {
  const declarationStart = source.indexOf(`function ${functionName}(`)
  if (declarationStart < 0) {
    throw new Error(`Unable to find inline ${functionName} declaration`)
  }

  const bodyStart = source.indexOf('{', declarationStart)
  if (bodyStart < 0) {
    throw new Error(`Unable to find inline ${functionName} body`)
  }

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    if (character === '}') depth -= 1
    if (depth === 0) {
      return source.slice(declarationStart, index + 1)
    }
  }

  throw new Error(`Unable to find end of inline ${functionName} declaration`)
}

function loadInlineChangedFileHelpers(): InlineChangedFileHelpers {
  const base2Source = readFileSync(
    new URL('../base2/base2.ts', import.meta.url),
    'utf8',
  )
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const base2JavaScript = transpiler.transformSync(base2Source)
  const helperSource = INLINE_HELPER_NAMES.map((functionName) =>
    extractInlineFunctionSource(base2JavaScript, functionName),
  ).join('\n\n')
  const buildHelpers = new Function(
    'process',
    `"use strict";\n${helperSource}\nreturn { extractChangedFilesFromMessages }`,
  ) as InlineHelperFactory

  return buildHelpers(process)
}

describe('serialized base2 changed-file helpers', () => {
  test('extractChangedFilesFromMessages recognizes every gate-tracked edit path shape', () => {
    const { extractChangedFilesFromMessages } = loadInlineChangedFileHelpers()

    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolName: 'str_replace',
            input: { path: './src/a.ts' },
          },
          {
            type: 'tool-call',
            toolName: 'edit_transaction',
            input: {
              edits: [{ path: 'src/b.ts' }, { path: 'src/b.ts' }],
            },
          },
          {
            type: 'tool-call',
            toolName: 'apply_patch',
            input: {
              operation: { path: 'src/c.ts' },
            },
          },
          {
            type: 'tool-call',
            toolName: 'apply_smart_patch',
            input: { path: 'src/d.ts' },
          },
        ],
      },
      {
        role: 'tool',
        toolName: 'write_file',
        content: [
          {
            type: 'json',
            value: {
              file: 'src/e.ts',
              success: true,
            },
          },
        ],
      },
      {
        role: 'tool',
        toolName: 'replace_range',
        content: [
          {
            type: 'json',
            value: {
              changedFiles: ['src/f.ts', './src/a.ts'],
            },
          },
        ],
      },
    ]

    expect(extractChangedFilesFromMessages(messages, 0)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
      'src/f.ts',
    ])
  })

  test('extractChangedFilesFromMessages ignores pre-start messages and failed edit artifacts', () => {
    const { extractChangedFilesFromMessages } = loadInlineChangedFileHelpers()

    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolName: 'write_file',
            input: { path: 'src/old.ts' },
          },
        ],
      },
      {
        role: 'tool',
        toolName: 'write_file',
        content: [
          {
            type: 'json',
            value: {
              file: 'src/failed.ts',
              success: false,
              error: 'strict read-before-edit blocked',
            },
          },
        ],
      },
      {
        role: 'tool',
        toolName: 'write_file',
        content: [
          {
            type: 'json',
            value: {
              file: 'src/ok.ts',
              success: true,
            },
          },
        ],
      },
    ]

    expect(extractChangedFilesFromMessages(messages, 1)).toEqual(['src/ok.ts'])
  })
})
