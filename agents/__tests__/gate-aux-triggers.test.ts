import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

type GateAuxHelpers = {
  normalizeGateFilePath: (file: string) => string
  gateFileSetsEqual: (left: string[], right: string[]) => boolean
  matchesSecuritySensitiveGlob: (files: string[]) => boolean
  inferPackageTestCommand: (filePath: string) => string | null
  isNonTestSourceFile: (filePath: string) => boolean
  selectTestWriterTargets: (
    files: string[],
  ) => { targetFiles: string[]; testCommand: string | null }
  isPublicApiSourceFile: (filePath: string) => boolean
  selectDocWriterTargets: (files: string[]) => string[]
  detectPendingGateFileSetChange: (
    activeWorkState: AuxWorkState,
    currentFiles: string[],
  ) => boolean
  resetAuxGateFlags: (
    activeWorkState: AuxWorkState,
    currentFiles: string[],
  ) => void
}

type GateAuxFunctionName = keyof GateAuxHelpers

// Minimal structural stand-in for Base2ActiveWorkState fields the inline
// functions touch. Constructed in tests via a local factory; never imported
// from the agent runtime to keep this a pure inline-extraction harness.
interface AuxWorkState {
  auxGatesLastPendingFiles: string[]
  preEditSecurityReviewDone: boolean
  testWriterGateDone: boolean
  docWriterGateDone: boolean
}

type InlineHelperFactory = (processValue: typeof process) => GateAuxHelpers

// Function declarations (extractable by the brace-balancing extractor) and the
// two `const` arrays (extractable by the bracket-balancing extractor). Listed in
// dependency order so each reference resolves at reconstruction time.
const INLINE_FUNCTION_NAMES: GateAuxFunctionName[] = [
  'normalizeGateFilePath',
  'gateFileSetsEqual',
  'matchesSecuritySensitiveGlob',
  'inferPackageTestCommand',
  'isNonTestSourceFile',
  'selectTestWriterTargets',
  'isPublicApiSourceFile',
  'selectDocWriterTargets',
  'detectPendingGateFileSetChange',
  'resetAuxGateFlags',
]

const INLINE_CONST_NAMES = [
  'SECURITY_SENSITIVE_GLOBS',
  'SECURITY_SENSITIVE_NAME_SUBSTRINGS',
] as const

/**
 * Extract an inline declaration from transpiled JS. Handles both `function NAME(`
 * (brace-balanced) and `const NAME = [` (bracket-balanced) declarations. We
 * generalize the existing gate-reviewer/gate-paths extractor because the
 * SECURITY_SENSITIVE_* arrays are not function declarations.
 */
function extractInlineSource(source: string, name: string): string {
  const fnStart = source.indexOf(`function ${name}(`)
  if (fnStart >= 0) {
    const bodyStart = source.indexOf('{', fnStart)
    if (bodyStart < 0) {
      throw new Error(`Unable to find inline ${name} body`)
    }
    let depth = 0
    for (let index = bodyStart; index < source.length; index += 1) {
      const character = source[index]
      if (character === '{') depth += 1
      if (character === '}') depth -= 1
      if (depth === 0) {
        return source.slice(fnStart, index + 1)
      }
    }
    throw new Error(`Unable to find end of inline ${name} declaration`)
  }

  // Fallback: const NAME = [ ... ]; (array literal) — balance brackets.
  const constStart = source.indexOf(`const ${name} =`)
  if (constStart < 0) {
    throw new Error(`Unable to find inline ${name} declaration`)
  }
  const bracketStart = source.indexOf('[', constStart)
  if (bracketStart < 0) {
    throw new Error(`Unable to find inline ${name} array start`)
  }
  let depth = 0
  for (let index = bracketStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === '[') depth += 1
    if (character === ']') depth -= 1
    if (depth === 0) {
      // Include the trailing semicolon that Bun's transpiler emits.
      const semiIndex = source[index + 1] === ';' ? index + 2 : index + 1
      return source.slice(constStart, semiIndex)
    }
  }
  throw new Error(`Unable to find end of inline ${name} array declaration`)
}

function loadInlineGateAuxHelpers(): GateAuxHelpers {
  const base2Source = readFileSync(
    new URL('../base2/base2.ts', import.meta.url),
    'utf8',
  )
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const base2JavaScript = transpiler.transformSync(base2Source)
  const helperSource = [
    // const arrays first so functions can reference them.
    ...INLINE_CONST_NAMES.map((name) =>
      extractInlineSource(base2JavaScript, name),
    ),
    ...INLINE_FUNCTION_NAMES.map((name) =>
      extractInlineSource(base2JavaScript, name),
    ),
  ].join('\n\n')
  const buildHelpers = new Function(
    'process',
    `"use strict";\n${helperSource}\nreturn { normalizeGateFilePath, gateFileSetsEqual, matchesSecuritySensitiveGlob, inferPackageTestCommand, isNonTestSourceFile, selectTestWriterTargets, isPublicApiSourceFile, selectDocWriterTargets, detectPendingGateFileSetChange, resetAuxGateFlags }`,
  ) as InlineHelperFactory

  return buildHelpers(process)
}

function createState(
  over: Partial<AuxWorkState> = {},
): AuxWorkState {
  return {
    auxGatesLastPendingFiles: [],
    preEditSecurityReviewDone: false,
    testWriterGateDone: false,
    docWriterGateDone: false,
    ...over,
  }
}

describe('gate-aux-triggers', () => {
  const helpers = loadInlineGateAuxHelpers()

  describe('securityReviewerGate (matchesSecuritySensitiveGlob)', () => {
    test('auth/ directory segment match', () => {
      expect(helpers.matchesSecuritySensitiveGlob(['auth/foo.ts'])).toBe(true)
    })

    test('oauth nested directory segment match', () => {
      expect(
        helpers.matchesSecuritySensitiveGlob(['src/oauth/handshake.ts']),
      ).toBe(true)
    })

    test('basename substring `token` matches', () => {
      expect(
        helpers.matchesSecuritySensitiveGlob([
          'packages/sdk/src/auth-token.ts',
        ]),
      ).toBe(true)
    })

    test('.env file startsWith .env', () => {
      expect(helpers.matchesSecuritySensitiveGlob(['.env'])).toBe(true)
    })

    test('.env.local file startsWith .env', () => {
      expect(helpers.matchesSecuritySensitiveGlob(['.env.local'])).toBe(true)
    })

    test('billing segment OR stripe basename substring both yield true', () => {
      expect(
        helpers.matchesSecuritySensitiveGlob([
          'packages/billing/stripe-webhook.ts',
        ]),
      ).toBe(true)
    })

    test('non-sensitive util file is false', () => {
      expect(
        helpers.matchesSecuritySensitiveGlob([
          'common/src/util/strings.ts',
        ]),
      ).toBe(false)
    })

    test('base2.ts itself is not sensitive', () => {
      expect(
        helpers.matchesSecuritySensitiveGlob(['agents/base2/base2.ts']),
      ).toBe(false)
    })

    test('empty array is false', () => {
      expect(helpers.matchesSecuritySensitiveGlob([])).toBe(false)
    })

    test('normalize-before-match strips file://, cwd, and whitespace', () => {
      const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')
      const input = ` file://${cwd}/packages/sdk/src/auth-token.ts `
      expect(helpers.matchesSecuritySensitiveGlob([input])).toBe(true)
    })
  })

  describe('testWriterGate (selectTestWriterTargets)', () => {
    test('packages/sdk src maps to that package command', () => {
      const result = helpers.selectTestWriterTargets([
        'packages/sdk/src/run.ts',
      ])
      expect(result.targetFiles).toEqual(['packages/sdk/src/run.ts'])
      expect(result.testCommand).toBe(
        'cd packages/sdk && bun run typecheck && bun test',
      )
    })

    test('agents/<dir> non-test maps to agents package command', () => {
      const result = helpers.selectTestWriterTargets([
        'agents/git-committer/git-committer.ts',
      ])
      expect(result.targetFiles).toEqual([
        'agents/git-committer/git-committer.ts',
      ])
      expect(result.testCommand).toBe(
        'cd agents && bun run typecheck && bun test',
      )
    })

    test('common/src maps to common package command', () => {
      const result = helpers.selectTestWriterTargets(['common/src/tools/list.ts'])
      expect(result.targetFiles).toEqual(['common/src/tools/list.ts'])
      expect(result.testCommand).toBe(
        'cd common && bun run typecheck && bun test',
      )
    })

    test('cli/src maps to cli package command', () => {
      const result = helpers.selectTestWriterTargets([
        'cli/src/components/foo.tsx',
      ])
      expect(result.targetFiles).toEqual(['cli/src/components/foo.tsx'])
      expect(result.testCommand).toBe(
        'cd cli && bun run typecheck && bun test',
      )
    })

    test('__tests__ file is filtered out', () => {
      const result = helpers.selectTestWriterTargets([
        'packages/sdk/src/__tests__/run.test.ts',
      ])
      expect(result.targetFiles).toEqual([])
      expect(result.testCommand).toBeNull()
    })

    test('.md file is filtered out', () => {
      const result = helpers.selectTestWriterTargets([
        'docs/agents-and-tools.md',
      ])
      expect(result.targetFiles).toEqual([])
      expect(result.testCommand).toBeNull()
    })

    test('agents base2 test file is filtered out', () => {
      const result = helpers.selectTestWriterTargets([
        'agents/base2/__tests__/base2.test.ts',
      ])
      expect(result.targetFiles).toEqual([])
      expect(result.testCommand).toBeNull()
    })

    test('mixed set keeps only non-test source; testCommand from first target', () => {
      const result = helpers.selectTestWriterTargets([
        'packages/sdk/src/run.ts',
        'packages/sdk/src/__tests__/run.test.ts',
        'docs/foo.md',
      ])
      expect(result.targetFiles).toEqual(['packages/sdk/src/run.ts'])
      expect(result.testCommand).toBe(
        'cd packages/sdk && bun run typecheck && bun test',
      )
    })

    test('evals/ file is filtered out', () => {
      const result = helpers.selectTestWriterTargets(['evals/buffbench/main.ts'])
      expect(result.targetFiles).toEqual([])
      expect(result.testCommand).toBeNull()
    })

    test('empty input yields empty targets and null command', () => {
      const result = helpers.selectTestWriterTargets([])
      expect(result).toEqual({ targetFiles: [], testCommand: null })
    })
  })

  describe('docWriterGate (selectDocWriterTargets)', () => {
    test('packages/<name>/src included', () => {
      expect(helpers.selectDocWriterTargets(['packages/sdk/src/run.ts'])).toEqual(
        ['packages/sdk/src/run.ts'],
      )
    })

    test('agents/<dir> non-test included', () => {
      expect(
        helpers.selectDocWriterTargets(['agents/git-committer/git-committer.ts']),
      ).toEqual(['agents/git-committer/git-committer.ts'])
    })

    test('common/src included', () => {
      expect(helpers.selectDocWriterTargets(['common/src/tools/list.ts'])).toEqual(
        ['common/src/tools/list.ts'],
      )
    })

    test('cli/src included', () => {
      expect(
        helpers.selectDocWriterTargets(['cli/src/components/foo.tsx']),
      ).toEqual(['cli/src/components/foo.tsx'])
    })

    test('__tests__ excluded', () => {
      expect(
        helpers.selectDocWriterTargets(['packages/sdk/src/__tests__/run.test.ts']),
      ).toEqual([])
    })

    test('docs .md excluded', () => {
      expect(
        helpers.selectDocWriterTargets(['docs/agents-and-tools.md']),
      ).toEqual([])
    })

    test('evals/ excluded', () => {
      expect(helpers.selectDocWriterTargets(['evals/buffbench/main.ts'])).toEqual(
        [],
      )
    })

    test('agents/__tests__/ prefix excluded', () => {
      expect(
        helpers.selectDocWriterTargets([
          'agents/__tests__/gate-aux-triggers.test.ts',
        ]),
      ).toEqual([])
    })

    test('empty input yields []', () => {
      expect(helpers.selectDocWriterTargets([])).toEqual([])
    })
  })

  describe('idempotency / pending-file-set reset', () => {
    test('fresh state detects change; reset clears flags and stores the set', () => {
      const state = createState()
      expect(
        helpers.detectPendingGateFileSetChange(state, ['a.ts', 'b.ts']),
      ).toBe(true)

      helpers.resetAuxGateFlags(state, ['a.ts', 'b.ts'])
      expect(state.preEditSecurityReviewDone).toBe(false)
      expect(state.testWriterGateDone).toBe(false)
      expect(state.docWriterGateDone).toBe(false)
      expect(state.auxGatesLastPendingFiles).toEqual(['a.ts', 'b.ts'])
    })

    test('second call with same set after reset is stable (no change)', () => {
      const state = createState()
      helpers.resetAuxGateFlags(state, ['a.ts', 'b.ts'])
      expect(
        helpers.detectPendingGateFileSetChange(state, ['a.ts', 'b.ts']),
      ).toBe(false)
    })

    test('switching to a new set is detected; reset clears flags again', () => {
      const state = createState()
      helpers.resetAuxGateFlags(state, ['a.ts', 'b.ts'])
      expect(
        helpers.detectPendingGateFileSetChange(state, ['c.ts']),
      ).toBe(true)
      helpers.resetAuxGateFlags(state, ['c.ts'])
      expect(state.preEditSecurityReviewDone).toBe(false)
      expect(state.testWriterGateDone).toBe(false)
      expect(state.docWriterGateDone).toBe(false)
      expect(state.auxGatesLastPendingFiles).toEqual(['c.ts'])
    })

    test('order-insensitive comparison via gateFileSetsEqual', () => {
      // Direct predicate: reversed-order set is still equal.
      expect(
        helpers.gateFileSetsEqual(['a.ts', 'b.ts'], ['b.ts', 'a.ts']),
      ).toBe(true)

      // End-to-end: switching back to a reversed-order set is NOT detected as
      // a change because the comparison is order-insensitive.
      const state = createState()
      helpers.resetAuxGateFlags(state, ['a.ts', 'b.ts'])
      expect(
        helpers.detectPendingGateFileSetChange(state, ['b.ts', 'a.ts']),
      ).toBe(false)
    })

    test('reset clears a manually-set preEditSecurityReviewDone flag', () => {
      const state = createState()
      helpers.resetAuxGateFlags(state, ['a.ts'])
      state.preEditSecurityReviewDone = true

      helpers.resetAuxGateFlags(state, ['b.ts', 'c.ts'])
      expect(state.preEditSecurityReviewDone).toBe(false)
      expect(state.auxGatesLastPendingFiles).toEqual(['b.ts', 'c.ts'])
    })
  })
})
