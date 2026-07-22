import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  gateFileSetsEqual,
  normalizeGateFilePath,
  normalizeGateFileList,
} from '../base2/gate-paths'

type GatePathHelpers = {
  normalizeGateFilePath: (file: string) => string
  normalizeGateFileList: (files: string[]) => string[]
  gateFileSetsEqual: (left: string[], right: string[]) => boolean
}

type GatePathFunctionName = keyof GatePathHelpers
type InlineHelperFactory = () => GatePathHelpers

const INLINE_HELPER_NAMES: GatePathFunctionName[] = [
  'normalizeGateFilePath',
  'normalizeGateFileList',
  'gateFileSetsEqual',
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

function loadInlineGatePathHelpers(): GatePathHelpers {
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
    `"use strict";\n${helperSource}\nreturn { normalizeGateFilePath, normalizeGateFileList, gateFileSetsEqual }`,
  ) as InlineHelperFactory

  return buildHelpers()
}

describe('gate-path helpers — inline copies match canonical exports', () => {
  test('normalizeGateFilePath parity across representative inputs', () => {
    const inlineHelpers = loadInlineGatePathHelpers()

    // Derive absolute-path cases from the live cwd so the expectation stays
    // deterministic regardless of where the test runs. normalizeGateFilePath
    // reads process.cwd() internally.
    const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')

    const pathInputs: string[] = [
      // plain relative paths
      'src/foo.ts',
      'packages/sdk/src/index.ts',
      // paths with backslashes (windows-style separators)
      'src\\foo\\bar.ts',
      'a\\b\\c.ts',
      // file:// prefixes
      `file://${cwd}/src/foo.ts`,
      'file:///Users/example/project/outside.ts',
      // ./ prefixes
      './src/foo.ts',
      './././nested/thing.ts',
      // .. traversal (must normalize to '')
      '../escape.ts',
      'src/../../escape.ts',
      'a/../../b.ts',
      // absolute path inside cwd
      `${cwd}/src/inside.ts`,
      cwd,
      // absolute path outside cwd
      '/some/other/outside.ts',
      '/etc/passwd',
      // empty / whitespace
      '',
      '   ',
    ]

    for (const input of pathInputs) {
      expect(inlineHelpers.normalizeGateFilePath(input)).toBe(
        normalizeGateFilePath(input),
      )
    }
  })

  test('normalizeGateFileList parity including dedup', () => {
    const inlineHelpers = loadInlineGatePathHelpers()

    const listInputs: string[][] = [
      [],
      ['src/foo.ts', 'src/bar.ts'],
      // duplicates that dedupe after normalization
      ['src/foo.ts', './src/foo.ts', 'src\\foo.ts', 'src/foo.ts'],
      // mix of valid, traversal (dropped), and empty entries
      ['src/foo.ts', '../escape.ts', '', 'src/bar.ts', 'src/foo.ts'],
    ]

    for (const input of listInputs) {
      expect(inlineHelpers.normalizeGateFileList(input)).toEqual(
        normalizeGateFileList(input),
      )
    }
  })

  test('gateFileSetsEqual parity across equal, differing, and disjoint sets', () => {
    const inlineHelpers = loadInlineGatePathHelpers()

    const setPairs: Array<[string[], string[]]> = [
      // equal sets, different order
      [
        ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        ['src/c.ts', 'src/a.ts', 'src/b.ts'],
      ],
      // different-length sets
      [['src/a.ts'], ['src/a.ts', 'src/b.ts']],
      [['src/a.ts', 'src/b.ts'], ['src/a.ts']],
      // disjoint sets
      [['src/a.ts'], ['src/z.ts']],
      [
        ['src/a.ts', 'src/b.ts'],
        ['src/x.ts', 'src/y.ts'],
      ],
      // both empty
      [[], []],
    ]

    for (const [left, right] of setPairs) {
      expect(inlineHelpers.gateFileSetsEqual(left, right)).toBe(
        gateFileSetsEqual(left, right),
      )
    }
  })
})
