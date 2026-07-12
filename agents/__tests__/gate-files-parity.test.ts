import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  collectToolInputFiles,
  hasEditArtifact,
  isFileChangingTool,
  visitToolValue,
} from '../base2/gate-files'

type GateFilesHelpers = {
  isFileChangingTool: (toolName: string) => boolean
  hasEditArtifact: (record: Record<string, unknown>) => boolean
  collectToolInputFiles: (input: unknown, out: Set<string>) => void
  visitToolValue: (value: unknown, out: Set<string>) => void
}

type GateFilesFunctionName = keyof GateFilesHelpers
type InlineHelperFactory = () => GateFilesHelpers

// editor.ts renames `visitToolValue` to `visit`; alias it so the same battery
// of inputs exercises both copies through a common interface.
const EDITOR_NAME_ALIASES: Record<GateFilesFunctionName, string> = {
  isFileChangingTool: 'isFileChangingTool',
  hasEditArtifact: 'hasEditArtifact',
  collectToolInputFiles: 'collectToolInputFiles',
  visitToolValue: 'visit',
}

const INLINE_HELPER_NAMES: GateFilesFunctionName[] = [
  'isFileChangingTool',
  'hasEditArtifact',
  'collectToolInputFiles',
  'visitToolValue',
]

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

function loadInlineHelpers(
  sourcePath: string,
  nameMap: Record<GateFilesFunctionName, string>,
): GateFilesHelpers {
  const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8')
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const javaScript = transpiler.transformSync(source)
  const helperSource = INLINE_HELPER_NAMES.map((functionName) =>
    extractInlineFunctionSource(javaScript, nameMap[functionName]),
  ).join('\n\n')
  // The `visitToolValue` canonical helper is named `visit` inside editor.ts,
  // so the return statement must reference the extracted name, not a
  // hard-coded `visitToolValue` identifier.
  const visitToolValueExtractedName = nameMap.visitToolValue
  const buildHelpers = new Function(
    `"use strict";\n${helperSource}\nreturn { isFileChangingTool, hasEditArtifact, collectToolInputFiles, visit: ${visitToolValueExtractedName} }`,
  ) as () => {
    isFileChangingTool: (toolName: string) => boolean
    hasEditArtifact: (record: Record<string, unknown>) => boolean
    collectToolInputFiles: (input: unknown, out: Set<string>) => void
    visit: (value: unknown, out: Set<string>) => void
  }

  const built = buildHelpers()
  return {
    isFileChangingTool: built.isFileChangingTool,
    hasEditArtifact: built.hasEditArtifact,
    collectToolInputFiles: built.collectToolInputFiles,
    // editor.ts names this `visit`; base2.ts names it `visitToolValue`. The
    // build-time return above aliases whichever exists to `visit`, so the
    // returned object always exposes it under the canonical name.
    visitToolValue: built.visit,
  }
}

describe('gate-files helpers — inline copies match canonical exports', () => {
  test('base2 inline copies match canonical gate-files.ts exports', () => {
    const inline = loadInlineHelpers(
      '../base2/base2.ts',
      INLINE_HELPER_NAMES.reduce(
        (acc, name) => ({ ...acc, [name]: name }),
        {} as Record<GateFilesFunctionName, string>,
      ),
    )
    assertParity(inline)
  })

  test('editor inline copies match canonical gate-files.ts exports', () => {
    const inline = loadInlineHelpers('../editor/editor.ts', EDITOR_NAME_ALIASES)
    assertParity(inline)
  })

  function assertParity(inline: GateFilesHelpers): void {
    // isFileChangingTool parity
    const toolNames = [
      'apply_patch',
      'apply_smart_patch',
      'edit_transaction',
      'replace_range',
      'rewrite_symbol',
      'str_replace',
      'write_file',
      'read_files',
      'run_terminal_command',
      'list_directory',
      '',
      'APPLY_PATCH',
      'str_replace_extra',
    ]
    for (const toolName of toolNames) {
      expect(inline.isFileChangingTool(toolName)).toBe(
        isFileChangingTool(toolName),
      )
    }

    // hasEditArtifact parity — covers diff artifacts, explicit success/error,
    // success-verb messages, failure-indicator messages, and edge cases.
    const records: Record<string, unknown>[] = [
      {
        kind: 'file_mutation_result',
        authorityTier: 'portable_path',
        actions: [{ path: 'src/a.ts', outcome: 'applied' }],
      },
      { unifiedDiff: 'diff --git a b' },
      { diff: '@@ -1 +1 @@' },
      { patch: '*** Begin Patch' },
      { success: true },
      { success: false },
      { error: 'strict read-before-edit blocked' },
      { errorMessage: 'something went wrong' },
      { message: 'File written successfully' },
      { message: 'Patch applied' },
      { message: 'edited 3 lines' },
      { message: 'replaced the block' },
      { message: 'No edits were applied' },
      { message: 'Error: nothing was applied' },
      { message: 'Failed to write file' },
      { message: 'skipped no-op' },
      { message: 'was not able to apply' },
      { success: true, message: 'failed on a sub-step' },
      {},
      { unrelated: 'field' },
      { message: 123 },
    ]
    for (const record of records) {
      expect(inline.hasEditArtifact(record)).toBe(hasEditArtifact(record))
    }

    // collectToolInputFiles parity — the three edit-tool input shapes plus
    // malformed/empty inputs.
    const inputCases: unknown[] = [
      { path: 'src/a.ts' },
      { operation: { path: 'src/b.ts' } },
      {
        edits: [
          { path: 'src/c.ts' },
          { path: 'src/d.ts' },
          { notPath: 'x' },
          null,
        ],
      },
      { path: 'src/e.ts', operation: { path: 'src/f.ts' } },
      null,
      undefined,
      'not-an-object',
      42,
      {},
      { path: 123 },
      { operation: 'no-path' },
      { edits: 'not-an-array' },
    ]
    for (const input of inputCases) {
      const canonOut = new Set<string>()
      const inlineOut = new Set<string>()
      collectToolInputFiles(input, canonOut)
      inline.collectToolInputFiles(input, inlineOut)
      expect([...inlineOut].sort()).toEqual([...canonOut].sort())
    }

    // visitToolValue parity — recursive walking over realistic tool-result /
    // message-history fragments. Covers json envelopes, changedFiles arrays,
    // file/path artifacts, and nested objects.
    const valueCases: unknown[] = [
      // single file-changing tool-call input
      {
        type: 'tool-call',
        toolName: 'str_replace',
        input: { path: 'src/a.ts' },
      },
      // apply_patch operation wrapper
      {
        toolName: 'apply_patch',
        input: { operation: { path: 'src/b.ts' } },
      },
      // edit_transaction edits array
      {
        toolName: 'edit_transaction',
        input: { edits: [{ path: 'src/c.ts' }, { path: 'src/d.ts' }] },
      },
      // tool-result with file artifact + success
      {
        type: 'json',
        value: { file: 'src/e.ts', success: true },
      },
      // tool-result with changedFiles array
      {
        changedFiles: ['src/f.ts', 'src/g.ts'],
      },
      // tool-result with path artifact + success message
      {
        path: 'src/h.ts',
        message: 'File written successfully',
      },
      // failed edit — must NOT be collected
      {
        file: 'src/failed.ts',
        success: false,
      },
      // nested json envelope wrapping a tool-call
      {
        type: 'json',
        value: {
          nested: [{ toolName: 'write_file', input: { path: 'src/i.ts' } }],
        },
      },
      // mixed array of shapes
      [
        { toolName: 'replace_range', input: { path: 'src/j.ts' } },
        { type: 'json', value: { file: 'src/k.ts', success: true } },
        'bare-string',
        42,
        null,
      ],
      // legacy cb_tool_name carrier
      {
        cb_tool_name: 'str_replace',
        input: { path: 'src/l.ts' },
      },
      // non-file-changing tool — input path ignored
      {
        toolName: 'read_files',
        input: { paths: ['src/m.ts'] },
      },
      // empty / primitive
      null,
      undefined,
      '',
      0,
    ]
    for (const value of valueCases) {
      const canonOut = new Set<string>()
      const inlineOut = new Set<string>()
      visitToolValue(value, canonOut)
      inline.visitToolValue(value, inlineOut)
      expect([...inlineOut].sort()).toEqual([...canonOut].sort())
    }
  }
})
