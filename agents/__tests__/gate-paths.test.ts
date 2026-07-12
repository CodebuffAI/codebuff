import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  gateFileSetsEqual,
  normalizeGateFileList,
  normalizeGateFilePath,
} from '../base2/gate-paths'

type NormalizeGateFilePath = (file: string) => string
type NormalizeGateFileList = (files: string[]) => string[]
type GateFileSetsEqual = (left: string[], right: string[]) => boolean

type GatePathHelpers = {
  normalizeGateFilePath: NormalizeGateFilePath
  normalizeGateFileList: NormalizeGateFileList
  gateFileSetsEqual: GateFileSetsEqual
}

type GatePathFunctionName = keyof GatePathHelpers
type InlineHelperFactory = (processValue: typeof process) => GatePathHelpers

const INLINE_HELPER_NAMES: GatePathFunctionName[] = [
  'normalizeGateFilePath',
  'normalizeGateFileList',
  'gateFileSetsEqual',
]

function extractInlineFunctionSource(
  source: string,
  functionName: GatePathFunctionName,
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

function stripTypeScriptAnnotations(functionSource: string): string {
  return functionSource
    .replace(
      'function normalizeGateFilePath(file: string): string',
      'function normalizeGateFilePath(file)',
    )
    .replace(
      'function normalizeGateFileList(files: string[]): string[]',
      'function normalizeGateFileList(files)',
    )
    .replace(
      'function gateFileSetsEqual(left: string[], right: string[]): boolean',
      'function gateFileSetsEqual(left, right)',
    )
    .replace(
      'const normalizedFiles: string[] = []',
      'const normalizedFiles = []',
    )
    .replace('new Set<string>()', 'new Set()')
}

function loadInlineGatePathHelpers(): GatePathHelpers {
  const base2Source = readFileSync(
    new URL('../base2/base2.ts', import.meta.url),
    'utf8',
  )
  const helperSource = INLINE_HELPER_NAMES.map((functionName) =>
    stripTypeScriptAnnotations(
      extractInlineFunctionSource(base2Source, functionName),
    ),
  ).join('\n\n')
  const buildHelpers = new Function(
    'process',
    `"use strict";\n${helperSource}\nreturn { normalizeGateFilePath, normalizeGateFileList, gateFileSetsEqual }`,
  ) as InlineHelperFactory

  return buildHelpers(process)
}

describe('gate-paths helpers', () => {
  test('normalizeGateFilePath strips file://, leading drive slash, cwd, and ./', () => {
    const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')

    expect(normalizeGateFilePath('  src/a.ts  ')).toBe('src/a.ts')
    expect(normalizeGateFilePath('src\\nested\\b.ts')).toBe('src/nested/b.ts')
    expect(normalizeGateFilePath('file:///C:/proj/src/a.ts')).toBe('')
    expect(normalizeGateFilePath('/etc/passwd')).toBe('')
    expect(normalizeGateFilePath('./src/a.ts')).toBe('src/a.ts')
    expect(normalizeGateFilePath('././src/a.ts')).toBe('src/a.ts')
    expect(normalizeGateFilePath(`${cwd}/src/a.ts`)).toBe('src/a.ts')
    expect(normalizeGateFilePath(`file://${cwd}/src/a.ts`)).toBe('src/a.ts')
    expect(normalizeGateFilePath('')).toBe('')
    expect(normalizeGateFilePath('   ')).toBe('')
  })

  test('normalizeGateFileList de-duplicates and drops empties preserving order', () => {
    const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')
    const result = normalizeGateFileList([
      'src/a.ts',
      './src/a.ts',
      `${cwd}/src/a.ts`,
      '',
      '   ',
      'src/b.ts',
      'src\\b.ts',
    ])
    expect(result).toEqual(['src/a.ts', 'src/b.ts'])
  })

  test('gateFileSetsEqual treats order-independent same sets as equal', () => {
    expect(gateFileSetsEqual([], [])).toBe(true)
    expect(gateFileSetsEqual(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(gateFileSetsEqual(['a'], ['a', 'b'])).toBe(false)
    expect(gateFileSetsEqual(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  test('exported helpers match inline base2 mirror behavior', () => {
    const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')
    const inlineHelpers = loadInlineGatePathHelpers()

    const pathInputs = [
      '  src/a.ts  ',
      'src\\nested\\b.ts',
      'file:///C:/proj/src/a.ts',
      '/etc/passwd',
      './src/a.ts',
      '././src/a.ts',
      `${cwd}/src/a.ts`,
      `file://${cwd}/src/a.ts`,
      '',
      '   ',
    ]
    for (const input of pathInputs) {
      expect(inlineHelpers.normalizeGateFilePath(input)).toBe(
        normalizeGateFilePath(input),
      )
    }

    const listInputs = [
      [],
      [
        'src/a.ts',
        './src/a.ts',
        `${cwd}/src/a.ts`,
        '',
        '   ',
        'src/b.ts',
        'src\\b.ts',
      ],
      ['file:///C:/proj/src/a.ts', 'C:/proj/src/a.ts', './src/c.ts'],
    ]
    for (const input of listInputs) {
      expect(inlineHelpers.normalizeGateFileList(input)).toEqual(
        normalizeGateFileList(input),
      )
    }

    const fileSetInputs = [
      { left: [], right: [] },
      { left: ['a', 'b'], right: ['b', 'a'] },
      { left: ['a'], right: ['a', 'b'] },
      { left: ['a', 'b'], right: ['a', 'c'] },
    ]
    for (const { left, right } of fileSetInputs) {
      expect(inlineHelpers.gateFileSetsEqual(left, right)).toBe(
        gateFileSetsEqual(left, right),
      )
    }
  })
})
