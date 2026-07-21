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

// Static guard: the inline gate-files copies may only reference each other
// (the reconstructed set). A reference to any OTHER callable sibling declared
// in the same source file — a `function foo(` declaration or a function-valued
// `const foo = (...) =>` / `= function` binding — would be `undefined` once
// handleSteps is serialized and rebuilt with `new Function(...)`, which drops
// the module/closure scope. That failure otherwise only surfaces in the parity
// test when a specific input happens to execute the offending branch, so
// assert it statically here. Non-callable module bindings (data const/let,
// class, imports) are out of scope for this lexical check; the runtime parity
// assertions below still catch them when an input reaches that branch.
function assertNoSiblingHelperReferences(
  sourcePath: string,
  nameMap: Record<GateFilesFunctionName, string>,
): void {
  const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8')
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const javaScript = transpiler.transformSync(source)

  const collectCallableNames = (text: string): string[] => {
    const names: string[] = []
    const patterns = [
      // classic declaration: function foo(...)
      /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
      // function-valued binding: const/let/var foo = (...) => / = function / = async
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
    ]
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) names.push(match[1])
    }
    return names
  }

  const reconstructedNames = new Set(Object.values(nameMap))
  const helperBodies = INLINE_HELPER_NAMES.map((functionName) =>
    extractInlineFunctionSource(javaScript, nameMap[functionName]),
  )
  // Callable helpers declared locally inside a reconstructed body are in scope
  // after reconstruction, so exclude them; only names declared elsewhere are
  // dangerous siblings.
  const declaredInsideHelpers = new Set(
    helperBodies.flatMap(collectCallableNames),
  )
  const siblingNames = [...new Set(collectCallableNames(javaScript))].filter(
    (name) => !reconstructedNames.has(name) && !declaredInsideHelpers.has(name),
  )

  for (let index = 0; index < INLINE_HELPER_NAMES.length; index += 1) {
    const functionName = INLINE_HELPER_NAMES[index]
    const body = helperBodies[index]
    const referencedSiblings = siblingNames.filter((sibling) => {
      const escaped = sibling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`\\b${escaped}\\b`).test(body)
    })
    // A non-empty list means an inline copy references a callable sibling that
    // will not be in scope after new Function reconstruction — fail fast with
    // the names. NOTE: this lexical check can false-positive if a sibling name
    // appears only inside a string literal or comment in a helper body; keep
    // helper bodies free of such incidental mentions.
    expect({ functionName, referencedSiblings }).toEqual({
      functionName,
      referencedSiblings: [],
    })
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

  // Fail fast on the specific regression class where an inline gate-files copy
  // calls a sibling helper (e.g. a factored-out `hasAppliedMutationAction`)
  // that is not part of the reconstructed set. Without this guard the missing
  // reference only throws in the parity test when an input reaches that branch.
  test('base2 inline gate-files copies reference no non-reconstructed siblings', () => {
    assertNoSiblingHelperReferences(
      '../base2/base2.ts',
      INLINE_HELPER_NAMES.reduce(
        (acc, name) => ({ ...acc, [name]: name }),
        {} as Record<GateFilesFunctionName, string>,
      ),
    )
  })

  test('editor inline gate-files copies reference no non-reconstructed siblings', () => {
    assertNoSiblingHelperReferences('../editor/editor.ts', EDITOR_NAME_ALIASES)
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
