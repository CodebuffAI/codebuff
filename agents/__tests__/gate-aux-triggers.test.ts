import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

type GateAuxHelpers = {
  normalizeGateFilePath: (file: string) => string
  gateFileSetsEqual: (left: string[], right: string[]) => boolean
  matchesSecuritySensitiveGlob: (files: string[]) => boolean
  inferPackageTestCommand: (filePath: string) => string | null
  isNonTestSourceFile: (filePath: string) => boolean
  selectTestWriterTargets: (files: string[]) => {
    groups: Array<{
      targetFiles: string[]
      testCommand: string
      candidateTests: string[]
      manifest?: string
      packageRoot: string
    }>
  }
  selectProjectAwareTestWriterTargets: (
    files: string[],
    affectedTestResult: unknown,
    buildTargetResult: unknown,
  ) => {
    groups: Array<{
      targetFiles: string[]
      testCommand: string
      candidateTests: string[]
      manifest?: string
      packageRoot: string
    }>
  }
  isPublicApiSourceFile: (filePath: string) => boolean
  selectDocWriterTargets: (files: string[]) => string[]
  // Reorder helper: the aux-relevant subset used for the *GateDone reset
  // compare/store so aux outputs (test/doc files) don't perturb the
  // snapshot and trigger an infinite reset -> re-spawn loop.
  selectAuxRelevantFiles: (files: string[]) => string[]
  detectPendingGateFileSetChange: (
    activeWorkState: AuxWorkState,
    currentFiles: string[],
  ) => boolean
  resetAuxGateFlags: (
    activeWorkState: AuxWorkState,
    currentFiles: string[],
  ) => void
}

type InlineFunctionName =
  | keyof GateAuxHelpers
  | 'findJsonRecordWithArray'
  | 'inferWorkspaceRootFromPath'

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
const INLINE_FUNCTION_NAMES: InlineFunctionName[] = [
  'normalizeGateFilePath',
  'gateFileSetsEqual',
  'matchesSecuritySensitiveGlob',
  'inferPackageTestCommand',
  'isNonTestSourceFile',
  'inferWorkspaceRootFromPath',
  'selectTestWriterTargets',
  'findJsonRecordWithArray',
  'selectProjectAwareTestWriterTargets',
  'isPublicApiSourceFile',
  'selectDocWriterTargets',
  'selectAuxRelevantFiles',
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
    `"use strict";\n${helperSource}\nreturn { normalizeGateFilePath, gateFileSetsEqual, matchesSecuritySensitiveGlob, inferPackageTestCommand, isNonTestSourceFile, selectTestWriterTargets, selectProjectAwareTestWriterTargets, isPublicApiSourceFile, selectDocWriterTargets, selectAuxRelevantFiles, detectPendingGateFileSetChange, resetAuxGateFlags }`,
  ) as InlineHelperFactory

  return buildHelpers(process)
}

function createState(over: Partial<AuxWorkState> = {}): AuxWorkState {
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
        helpers.matchesSecuritySensitiveGlob(['common/src/util/strings.ts']),
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
      expect(result.groups).toEqual([
        {
          targetFiles: ['packages/sdk/src/run.ts'],
          testCommand: 'cd packages/sdk && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'packages/sdk',
        },
      ])
    })

    test('agents/<dir> non-test maps to agents package command', () => {
      const result = helpers.selectTestWriterTargets([
        'agents/git-committer/git-committer.ts',
      ])
      expect(result.groups).toEqual([
        {
          targetFiles: ['agents/git-committer/git-committer.ts'],
          testCommand: 'cd agents && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'agents',
        },
      ])
    })

    test('common/src maps to common package command', () => {
      const result = helpers.selectTestWriterTargets([
        'common/src/tools/list.ts',
      ])
      expect(result.groups).toEqual([
        {
          targetFiles: ['common/src/tools/list.ts'],
          testCommand: 'cd common && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'common',
        },
      ])
    })

    test('cli/src maps to cli package command', () => {
      const result = helpers.selectTestWriterTargets([
        'cli/src/components/foo.tsx',
      ])
      expect(result.groups).toEqual([
        {
          targetFiles: ['cli/src/components/foo.tsx'],
          testCommand: 'cd cli && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'cli',
        },
      ])
    })

    test('__tests__ file is filtered out', () => {
      const result = helpers.selectTestWriterTargets([
        'packages/sdk/src/__tests__/run.test.ts',
      ])
      expect(result.groups).toEqual([])
    })

    test('.md file is filtered out', () => {
      const result = helpers.selectTestWriterTargets([
        'docs/agents-and-tools.md',
      ])
      expect(result.groups).toEqual([])
    })

    test('agents base2 test file is filtered out', () => {
      const result = helpers.selectTestWriterTargets([
        'agents/base2/__tests__/base2.test.ts',
      ])
      expect(result.groups).toEqual([])
    })

    test('mixed set keeps only non-test source in its package group', () => {
      const result = helpers.selectTestWriterTargets([
        'packages/sdk/src/run.ts',
        'packages/sdk/src/__tests__/run.test.ts',
        'docs/foo.md',
      ])
      expect(result.groups).toEqual([
        {
          targetFiles: ['packages/sdk/src/run.ts'],
          testCommand: 'cd packages/sdk && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'packages/sdk',
        },
      ])
    })

    test('evals/ file is filtered out', () => {
      const result = helpers.selectTestWriterTargets([
        'evals/buffbench/main.ts',
      ])
      expect(result.groups).toEqual([])
    })

    test('groups mixed packages by their own validation command', () => {
      const result = helpers.selectTestWriterTargets([
        'packages/sdk/src/run.ts',
        'cli/src/chat.tsx',
      ])
      expect(result.groups).toEqual([
        {
          targetFiles: ['packages/sdk/src/run.ts'],
          testCommand: 'cd packages/sdk && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'packages/sdk',
        },
        {
          targetFiles: ['cli/src/chat.tsx'],
          testCommand: 'cd cli && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'cli',
        },
      ])
    })

    test('empty input yields no groups', () => {
      const result = helpers.selectTestWriterTargets([])
      expect(result).toEqual({ groups: [] })
    })

    test('project-aware routing preserves the nearest fallback workspace when affected-test evidence is incomplete', () => {
      const result = helpers.selectProjectAwareTestWriterTargets(
        ['packages/sdk/src/run.ts'],
        { targets: [] },
        { targets: [] },
      )

      expect(result.groups).toEqual([
        {
          targetFiles: ['packages/sdk/src/run.ts'],
          testCommand: 'cd packages/sdk && bun run typecheck && bun test',
          candidateTests: [],
          packageRoot: 'packages/sdk',
        },
      ])
    })

    test('project-aware routing falls back to a test command instead of treating a build-only command as test validation', () => {
      const result = helpers.selectProjectAwareTestWriterTargets(
        ['packages/sdk/src/run.ts'],
        {
          targets: [
            {
              source: 'packages/sdk/src/run.ts',
              candidates: ['packages/sdk/src/__tests__/run.test.ts'],
              packageRoot: 'packages/sdk',
            },
          ],
        },
        {
          targets: [
            {
              packageRoot: 'packages/sdk',
              manifest: 'packages/sdk/package.json',
              commands: ['bun run typecheck', 'bun run build'],
            },
          ],
        },
      )

      expect(result.groups).toEqual([
        {
          targetFiles: ['packages/sdk/src/run.ts'],
          testCommand: 'cd packages/sdk && bun run typecheck && bun test',
          candidateTests: ['packages/sdk/src/__tests__/run.test.ts'],
          manifest: 'packages/sdk/package.json',
          packageRoot: 'packages/sdk',
        },
      ])
    })
  })

  describe('docWriterGate (selectDocWriterTargets)', () => {
    test('packages/<name>/src included', () => {
      expect(
        helpers.selectDocWriterTargets(['packages/sdk/src/run.ts']),
      ).toEqual(['packages/sdk/src/run.ts'])
    })

    test('agents/<dir> non-test included', () => {
      expect(
        helpers.selectDocWriterTargets([
          'agents/git-committer/git-committer.ts',
        ]),
      ).toEqual(['agents/git-committer/git-committer.ts'])
    })

    test('common/src included', () => {
      expect(
        helpers.selectDocWriterTargets(['common/src/tools/list.ts']),
      ).toEqual(['common/src/tools/list.ts'])
    })

    test('cli/src included', () => {
      expect(
        helpers.selectDocWriterTargets(['cli/src/components/foo.tsx']),
      ).toEqual(['cli/src/components/foo.tsx'])
    })

    test('__tests__ excluded', () => {
      expect(
        helpers.selectDocWriterTargets([
          'packages/sdk/src/__tests__/run.test.ts',
        ]),
      ).toEqual([])
    })

    test('docs .md excluded', () => {
      expect(
        helpers.selectDocWriterTargets(['docs/agents-and-tools.md']),
      ).toEqual([])
    })

    test('evals/ excluded', () => {
      expect(
        helpers.selectDocWriterTargets(['evals/buffbench/main.ts']),
      ).toEqual([])
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

  describe('selectAuxRelevantFiles (reorder reset-snapshot helper)', () => {
    test('packages/<name>/src source file is relevant (test-writer predicate)', () => {
      expect(
        helpers.selectAuxRelevantFiles(['packages/sdk/src/run.ts']),
      ).toEqual(['packages/sdk/src/run.ts'])
    })

    test('cli/src (*.tsx) file is relevant (doc-writer predicate)', () => {
      expect(
        helpers.selectAuxRelevantFiles(['cli/src/components/Button.tsx']),
      ).toEqual(['cli/src/components/Button.tsx'])
    })

    test('security-sensitive file is relevant even without a package mapping', () => {
      // .env files don't match a package test command and aren't a public-api
      // source file, but they ARE security-sensitive so the aux snapshot must
      // include them so security-reviewer's spawn is tracked.
      expect(helpers.selectAuxRelevantFiles(['.env'])).toEqual(['.env'])
    })

    test('test file written by test-writer is filtered out of the snapshot', () => {
      // The aux-output invariant: a __tests__/*.test.ts file written by the
      // test-writer subagent must NOT be in the aux-relevant subset, otherwise
      // the next loop sweep would add it to pendingGateFiles, perturb the reset
      // snapshot, and re-spawn test-writer forever.
      expect(
        helpers.selectAuxRelevantFiles([
          'packages/sdk/src/__tests__/run.test.ts',
        ]),
      ).toEqual([])
    })

    test('docs file written by doc-writer is filtered out of the snapshot', () => {
      // Same invariant for doc-writer's output: docs/agents-and-tools.md must
      // not be aux-relevant, or the reset snapshot grows after doc-writer runs
      // and triggers a spurious reset + re-spawn.
      expect(
        helpers.selectAuxRelevantFiles(['docs/agents-and-tools.md']),
      ).toEqual([])
    })

    test('mixed set keeps only aux-relevant files, preserving first-seen order', () => {
      // A source file, its generated test file, and a docs file: only the
      // source file is aux-relevant, and it stays in input order.
      const input = [
        'packages/sdk/src/run.ts',
        'packages/sdk/src/__tests__/run.test.ts',
        'docs/agents-and-tools.md',
      ]
      expect(helpers.selectAuxRelevantFiles(input)).toEqual([
        'packages/sdk/src/run.ts',
      ])
    })

    test('dedupes repeated aux-relevant files, keeping first occurrence', () => {
      expect(
        helpers.selectAuxRelevantFiles([
          'packages/sdk/src/run.ts',
          'packages/sdk/src/run.ts',
          'common/src/tools/list.ts',
        ]),
      ).toEqual(['packages/sdk/src/run.ts', 'common/src/tools/list.ts'])
    })

    test('empty input yields []', () => {
      expect(helpers.selectAuxRelevantFiles([])).toEqual([])
    })

    test('reset snapshot stays stable when an aux output joins pendingGateFiles (no infinite re-spawn)', () => {
      // End-to-end reproduction of the loop the reorder fixes:
      // 1. Orchestrator edits packages/sdk/src/run.ts -> aux-relevant snapshot
      //    is ['packages/sdk/src/run.ts']; reset stores it and clears flags.
      // 2. test-writer spawns and writes packages/sdk/src/__tests__/run.test.ts;
      //    the next top-of-loop sweep adds that test file to pendingGateFiles.
      // 3. selectAuxRelevantFiles of the new pending set must STILL equal the
      //    stored snapshot (the test file is filtered out), so
      //    detectPendingGateFileSetChange returns false and no reset + respawn
      //    happens. This is the regression guard for the infinite loop.
      const state = createState()
      const sourceFiles = ['packages/sdk/src/run.ts']
      const auxSnapshot = helpers.selectAuxRelevantFiles(sourceFiles)
      expect(auxSnapshot).toEqual(['packages/sdk/src/run.ts'])
      helpers.resetAuxGateFlags(state, auxSnapshot)
      state.testWriterGateDone = true

      const afterTestWriterRun = [
        'packages/sdk/src/run.ts',
        'packages/sdk/src/__tests__/run.test.ts',
      ]
      const newAuxSnapshot = helpers.selectAuxRelevantFiles(afterTestWriterRun)
      expect(newAuxSnapshot).toEqual(['packages/sdk/src/run.ts'])
      expect(
        helpers.detectPendingGateFileSetChange(state, newAuxSnapshot),
      ).toBe(false)
      expect(state.testWriterGateDone).toBe(true)
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
      expect(helpers.detectPendingGateFileSetChange(state, ['c.ts'])).toBe(true)
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
