import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

type ExtractChangedFilesFromMessages = (
  messages: unknown,
  startIndex: number,
) => string[]

type InlineChangedFileHelpers = {
  extractChangedFilesFromMessages: ExtractChangedFilesFromMessages
}

type InlineHelperFactory = (
  processValue: typeof process,
) => InlineChangedFileHelpers

function withCommittedReceipt<T extends Record<string, any>>(value: T): T {
  const receiptId = `${value.operationId}:receipt`
  return {
    ...value,
    receiptId,
    authorityReceipt: {
      kind: 'commit_receipt',
      version: 1,
      receiptId,
      operationId: value.operationId,
      callId: `${value.operationId}:call`,
      authorityTier: value.authorityTier,
      status: 'committed',
      actions: value.actions.map((action: Record<string, unknown>) => ({
        ...action,
        status: 'committed',
      })),
      finalHashes: Object.fromEntries(
        value.actions.map((action: Record<string, unknown>) => [
          action.path,
          action.afterHash,
        ]),
      ),
    },
  }
}

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
        toolName: 'edit_transaction',
        content: [
          {
            type: 'json',
            value: withCommittedReceipt({
              kind: 'file_mutation_result',
              version: 1,
              operationId: 'gate-all',
              outcome: 'applied',
              authorityTier: 'portable_path',
              actions: ['a', 'b', 'c', 'd', 'e', 'f'].map((name, index) => ({
                actionId: name,
                index,
                action: 'update',
                path: `src/${name}.ts`,
                outcome: 'applied',
                beforeHash: 'before',
                afterHash: 'after',
              })),
              errors: [],
              freshCapabilities: [],
            }),
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
            value: withCommittedReceipt({
              kind: 'file_mutation_result',
              version: 1,
              operationId: 'gate-ok',
              outcome: 'applied',
              authorityTier: 'portable_path',
              actions: [
                {
                  actionId: 'ok',
                  index: 0,
                  action: 'update',
                  path: 'src/ok.ts',
                  outcome: 'applied',
                  beforeHash: 'before',
                  afterHash: 'after',
                },
              ],
              errors: [],
              freshCapabilities: [],
            }),
          },
        ],
      },
    ]

    expect(extractChangedFilesFromMessages(messages, 1)).toEqual(['src/ok.ts'])
  })
})
