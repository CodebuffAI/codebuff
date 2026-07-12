import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  buildRepairEditorPrompt,
  parseValidationFailures,
  type ParsedValidationFailure,
} from '../base2/gate-repair'

type GateRepairHelpers = {
  parseValidationFailures: (failures: string[]) => ParsedValidationFailure[]
  buildRepairEditorPrompt: (
    parsed: ParsedValidationFailure[],
    pendingFiles: string[],
  ) => string
}

type GateRepairFunctionName = keyof GateRepairHelpers
type InlineHelperFactory = () => GateRepairHelpers

const INLINE_HELPER_NAMES: GateRepairFunctionName[] = [
  'parseValidationFailures',
  'buildRepairEditorPrompt',
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

function loadInlineGateRepairHelpers(): GateRepairHelpers {
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
    `"use strict";\n${helperSource}\nreturn { parseValidationFailures, buildRepairEditorPrompt }`,
  ) as InlineHelperFactory

  return buildHelpers()
}

describe('gate-repair helpers — inline copies match canonical exports', () => {
  test('exported helpers match inline base2 mirror behavior on real stderr samples', () => {
    const inlineHelpers = loadInlineGateRepairHelpers()

    // Realistic failure strings as produced by collectHookFailures in base2.ts:
    // "- {hookName} failed (exit {code}):\n{stdout+stderr}"
    const failureInputs: string[][] = [
      // tsc with multiple errors in one hook output
      [
        "- tsc failed (exit 1):\nsrc/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/foo.ts(28,10): error TS2304: Cannot find name 'bar'.",
      ],
      // eslint with rule codes
      [
        "- eslint failed (exit 1):\nsrc/bar.ts:10:5: no-unused-vars is defined but never used [eslint/no-unused-vars]\nsrc/bar.ts:20:3: unexpected token '{' [eslint/parse-error]",
      ],
      // generic gcc-style: file:line: message (no column)
      [
        "- gcc failed (exit 2):\nsrc/main.c:42: error: expected ';' before '}' token",
      ],
      // mixed: tsc error + a non-parseable raw line
      [
        "- tsc failed (exit 1):\nsrc/a.ts(5,1): error TS1005: '{' expected.\nsome random non-diagnostic line that has no file:line pattern",
      ],
      // empty / malformed
      [''],
      [],
      // unparseable only — no prefix, no file:line
      ['a totally unstructured error message with no location'],
      // duplicate locations within one failure body — should dedupe
      [
        '- tsc failed (exit 1):\nsrc/dup.ts(1,1): error TS2322: x\nsrc/dup.ts(1,1): error TS2322: x',
      ],
    ]

    for (const failures of failureInputs) {
      expect(inlineHelpers.parseValidationFailures(failures)).toEqual(
        parseValidationFailures(failures),
      )
    }

    // buildRepairEditorPrompt parity — exercise grouped, ungrouped, empty, and
    // pending-files-present shapes.
    const parsedInputs: ParsedValidationFailure[][] = [
      [],
      [
        {
          file: 'src/a.ts',
          line: 10,
          column: 5,
          message: 'error TS1',
          source: 'tsc',
        },
      ],
      [
        {
          file: 'src/a.ts',
          line: 10,
          column: 5,
          message: 'error TS1',
          source: 'tsc',
        },
        {
          file: 'src/a.ts',
          line: 25,
          column: 1,
          message: 'error TS2',
          source: 'tsc',
        },
        {
          file: 'src/b.ts',
          line: 3,
          message: 'eslint issue',
          source: 'eslint',
        },
        { file: '', message: 'unparseable raw output', source: 'unknown' },
      ],
      [{ file: '', message: 'only unparseable', source: 'gcc' }],
    ]
    const pendingFilesCases: string[][] = [
      [],
      ['src/a.ts'],
      ['src/a.ts', 'src/b.ts'],
    ]

    for (const parsed of parsedInputs) {
      for (const pendingFiles of pendingFilesCases) {
        expect(
          inlineHelpers.buildRepairEditorPrompt(parsed, pendingFiles),
        ).toBe(buildRepairEditorPrompt(parsed, pendingFiles))
      }
    }
  })
})
