import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  gateFileSetsEqual,
  isCoverageEvidenceFile,
  isReviewableGateFile,
  normalizeGateFilePath,
  normalizeGateFileList,
  selectCoverageEvidenceFiles,
  selectReviewableGateFiles,
} from '../base2/gate-paths'

type GatePathHelpers = {
  normalizeGateFilePath: (file: string) => string
  normalizeGateFileList: (files: string[]) => string[]
  gateFileSetsEqual: (left: string[], right: string[]) => boolean
  isReviewableGateFile: (filePath: string) => boolean
  selectReviewableGateFiles: (files: string[]) => string[]
  isCoverageEvidenceFile: (filePath: string) => boolean
  selectCoverageEvidenceFiles: (files: string[]) => string[]
}

type GatePathFunctionName = keyof GatePathHelpers
type InlineHelperFactory = () => GatePathHelpers

const INLINE_HELPER_NAMES: GatePathFunctionName[] = [
  'normalizeGateFilePath',
  'normalizeGateFileList',
  'gateFileSetsEqual',
  'isReviewableGateFile',
  'selectReviewableGateFiles',
  'isCoverageEvidenceFile',
  'selectCoverageEvidenceFiles',
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
    `"use strict";\n${helperSource}\nreturn { normalizeGateFilePath, normalizeGateFileList, gateFileSetsEqual, isReviewableGateFile, selectReviewableGateFiles, isCoverageEvidenceFile, selectCoverageEvidenceFiles }`,
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
      // windows drive-letter absolute with a leading slash ('/C:/...'): the
      // leading slash is stripped before the in-cwd/out-of-cwd check runs.
      '/C:/Users/example/project/src/foo.ts',
      // interior './' and '//' segments: gate-paths.normalizeGateFilePath must
      // NOT collapse these (unlike tool-executor.normalizeCoveragePath). Parity
      // here pins that the inline base2 copy matches gate-paths, protecting the
      // intentional divergence documented in the tool-executor coverage matcher.
      'src/./b.ts',
      'src//b.ts',
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

  test('isReviewableGateFile parity across reviewable and bookkeeping paths', () => {
    const inlineHelpers = loadInlineGatePathHelpers()

    // isReviewableGateFile operates on an ALREADY-NORMALIZED path (the caller
    // normalizes), so pass project-relative strings directly.
    const pathInputs: string[] = [
      // reviewable source (expect true)
      'src/foo.ts',
      // __tests__/ path (false)
      'src/__tests__/foo.ts',
      // .test.ts path (false)
      'src/foo.test.ts',
      // .generated.ts path (false)
      'src/foo.generated.ts',
      // docs/data/config extensions (false each)
      'notes/readme.md',
      'config/data.json',
      'logs/events.jsonl',
      'config/app.yaml',
      'config/app.toml',
      // .env / .env.local (false)
      '.env',
      '.env.local',
      // docs/ directory (false)
      'docs/guide.ts',
      // evals/ directory (false)
      'evals/case.ts',
      // .agents/sessions bookkeeping incl. STATE.json / EVENTS.jsonl (false)
      '.agents/sessions/slug/STATE.json',
      '.agents/sessions/slug/EVENTS.jsonl',
      // non-source extension (false)
      'assets/logo.png',
    ]

    for (const input of pathInputs) {
      expect(inlineHelpers.isReviewableGateFile(input)).toBe(
        isReviewableGateFile(input),
      )
    }
  })

  test('selectReviewableGateFiles parity across mixed, all-bookkeeping, and empty lists', () => {
    const inlineHelpers = loadInlineGatePathHelpers()

    // selectReviewableGateFiles normalizes + filters + dedupes internally, so
    // pass raw path lists.
    const listInputs: string[][] = [
      // mixed source + bookkeeping: only source survives, normalized + deduped
      [
        'src/foo.ts',
        './src/foo.ts',
        'src\\bar.ts',
        'notes/readme.md',
        'src/__tests__/foo.ts',
        'docs/guide.ts',
        '.agents/sessions/slug/STATE.json',
      ],
      // all bookkeeping -> []
      ['notes/readme.md', '.env', 'docs/guide.ts', 'evals/case.ts', 'x.jsonl'],
      // empty -> []
      [],
    ]

    for (const input of listInputs) {
      expect(inlineHelpers.selectReviewableGateFiles(input)).toEqual(
        selectReviewableGateFiles(input),
      )
    }
  })

  test('isCoverageEvidenceFile parity across test and non-test paths', () => {
    const inlineHelpers = loadInlineGatePathHelpers()

    // isCoverageEvidenceFile operates on an ALREADY-NORMALIZED path and is the
    // complement of isReviewableGateFile's test exclusion: only co-changed
    // test files (true), everything else (false).
    const pathInputs: string[] = [
      // __tests__/ path (true)
      'src/__tests__/foo.ts',
      'packages/agent-runtime/src/__tests__/run-agent-step-tools.test.ts',
      // .test.ts / .spec.ts / .test.tsx path (true)
      'src/foo.test.ts',
      'src/foo.spec.ts',
      'src/foo.test.tsx',
      // reviewable source (false)
      'src/foo.ts',
      // generated / docs / data (false each)
      'src/foo.generated.ts',
      'notes/readme.md',
      'config/data.json',
      // non-source extension (false)
      'assets/logo.png',
    ]

    for (const input of pathInputs) {
      expect(inlineHelpers.isCoverageEvidenceFile(input)).toBe(
        isCoverageEvidenceFile(input),
      )
    }
  })

  test('selectCoverageEvidenceFiles parity across mixed, all-source, and empty lists', () => {
    const inlineHelpers = loadInlineGatePathHelpers()

    // selectCoverageEvidenceFiles normalizes + filters + dedupes internally,
    // so pass raw path lists.
    const listInputs: string[][] = [
      // mixed source + tests: only tests survive, normalized + deduped
      [
        'src/foo.ts',
        'src/foo.test.ts',
        './src/foo.test.ts',
        'src/__tests__/bar.ts',
        'notes/readme.md',
        '.agents/sessions/slug/STATE.json',
      ],
      // all non-test source -> []
      ['src/foo.ts', 'src/bar.ts', 'notes/readme.md'],
      // empty -> []
      [],
    ]

    for (const input of listInputs) {
      expect(inlineHelpers.selectCoverageEvidenceFiles(input)).toEqual(
        selectCoverageEvidenceFiles(input),
      )
    }
  })
})

// Direct behavioral coverage for the canonical gate-paths.ts exports (as
// opposed to the parity suite above, which only asserts the inline base2
// copies match these exports). These assertions also keep the exports
// consumed (imported + exercised) so they are not dead code.
describe('gate-path helpers — canonical export behavior', () => {
  // normalizeGateFilePath reads process.cwd() internally; derive absolute-path
  // expectations from the live cwd so they stay deterministic.
  const cwd = process.cwd().replace(/\\/g, '/').replace(/\/+$/, '')

  test('normalizeGateFilePath rejects traversal + out-of-cwd absolutes and strips in-cwd prefixes', () => {
    // '..' traversal segments are rejected -> ''
    expect(normalizeGateFilePath('../escape.ts')).toBe('')
    expect(normalizeGateFilePath('src/../../escape.ts')).toBe('')
    // absolute paths outside cwd -> ''
    expect(normalizeGateFilePath('/etc/passwd')).toBe('')
    expect(normalizeGateFilePath('/some/other/outside.ts')).toBe('')
    // file:// pointing outside cwd -> '' (prefix stripped, still out-of-cwd)
    expect(normalizeGateFilePath('file:///some/other/outside.ts')).toBe('')
    // in-cwd absolute prefix is stripped to a repo-relative path
    expect(normalizeGateFilePath(`${cwd}/src/foo.ts`)).toBe('src/foo.ts')
    // file:// + in-cwd absolute path -> stripped to a repo-relative path
    expect(normalizeGateFilePath(`file://${cwd}/src/foo.ts`)).toBe(
      'src/foo.ts',
    )
    // plain relative, backslash, and leading './' inputs normalize as expected
    expect(normalizeGateFilePath('src/foo.ts')).toBe('src/foo.ts')
    expect(normalizeGateFilePath('src\\foo\\bar.ts')).toBe('src/foo/bar.ts')
    expect(normalizeGateFilePath('./src/foo.ts')).toBe('src/foo.ts')
    // '/C:/' windows drive prefix: the leading slash is stripped, leaving an
    // out-of-cwd absolute drive path on a posix runner -> ''.
    expect(normalizeGateFilePath('/C:/project/src/foo.ts')).toBe('')
    // Interior './' and '//' segments are NOT collapsed here. This pins the
    // intentional divergence from tool-executor.normalizeCoveragePath, which
    // adds an extra interior-segment collapse so its coverage matcher treats
    // 'src/./b.ts' and 'src//b.ts' as covering 'src/b.ts'. A future "sync" that
    // made all three copies identical would regress one of these assertions.
    expect(normalizeGateFilePath('src/./b.ts')).toBe('src/./b.ts')
    expect(normalizeGateFilePath('src//b.ts')).toBe('src//b.ts')
    // empty / whitespace -> ''
    expect(normalizeGateFilePath('')).toBe('')
    expect(normalizeGateFilePath('   ')).toBe('')
  })

  test('selectReviewableGateFiles keeps reviewable source and drops tests/generated/docs/data/bookkeeping', () => {
    const selected = selectReviewableGateFiles([
      // reviewable source (kept): .ts and .py
      'src/foo.ts',
      'scripts/tool.py',
      // __tests__/ and .test/.spec (dropped)
      'src/__tests__/foo.ts',
      'src/foo.test.ts',
      'src/foo.spec.ts',
      // .generated (dropped)
      'src/foo.generated.ts',
      // docs/data/config extensions (dropped): .md/.json/.jsonl/.yaml/.toml
      'notes/readme.md',
      'config/data.json',
      'logs/events.jsonl',
      'config/app.yaml',
      'config/app.toml',
      // .env and .env.local (dropped)
      '.env',
      '.env.local',
      // docs/ evals/ .agents/ prefixes (dropped)
      'docs/guide.ts',
      'evals/case.ts',
      '.agents/sessions/slug/STATE.json',
    ])
    expect(selected).toEqual(['src/foo.ts', 'scripts/tool.py'])
    // empty list -> []
    expect(selectReviewableGateFiles([])).toEqual([])
  })

  test('isCoverageEvidenceFile returns true only for test files', () => {
    // test files -> true
    expect(isCoverageEvidenceFile('src/__tests__/foo.ts')).toBe(true)
    expect(isCoverageEvidenceFile('src/foo.test.ts')).toBe(true)
    expect(isCoverageEvidenceFile('src/foo.spec.ts')).toBe(true)
    expect(isCoverageEvidenceFile('src/foo.test.tsx')).toBe(true)
    // everything else -> false
    expect(isCoverageEvidenceFile('src/foo.ts')).toBe(false)
    expect(isCoverageEvidenceFile('src/foo.generated.ts')).toBe(false)
    expect(isCoverageEvidenceFile('notes/readme.md')).toBe(false)
    expect(isCoverageEvidenceFile('config/data.json')).toBe(false)
    expect(isCoverageEvidenceFile('assets/logo.png')).toBe(false)
  })

  test('selectors normalize aliases, reject escaped paths, and split source from test evidence', () => {
    const inputs = [
      './src/feature.ts',
      'src\\feature.ts',
      '../outside.ts',
      '/outside/project.ts',
      './src/feature.test.ts',
      'src/__tests__/feature.ts',
    ]

    expect(selectReviewableGateFiles(inputs)).toEqual(['src/feature.ts'])
    expect(selectCoverageEvidenceFiles(inputs)).toEqual([
      'src/feature.test.ts',
      'src/__tests__/feature.ts',
    ])
  })

  test('selectCoverageEvidenceFiles recognizes tests, normalizes aliases, rejects traversal, and deduplicates', () => {
    expect(
      selectCoverageEvidenceFiles([
        'src/feature.test.ts',
        './src/feature.test.ts',
        'src\\feature.test.ts',
        'src/__tests__/feature.ts',
        'src/__tests__/feature.ts',
        '../outside.test.ts',
        '/outside/project.test.ts',
        'src/feature.ts',
      ]),
    ).toEqual(['src/feature.test.ts', 'src/__tests__/feature.ts'])
  })

  test('JS-flavored test files are excluded from reviewable source and treated as coverage evidence', () => {
    // RF-3/RF-9: widen the test/spec exclusion so JS-flavored test files
    // (foo.test.mjs/.cjs/.jsx, foo.spec.*) are treated as tests rather than
    // reviewable source. Without this, the reviewable include regex (which
    // already accepts mjs|cjs|jsx as source extensions) would classify a JS
    // test file as reviewable source.
    for (const testFile of [
      'src/foo.test.mjs',
      'src/foo.test.cjs',
      'src/foo.test.jsx',
      'src/foo.spec.mjs',
      'src/foo.spec.cjs',
      'src/foo.spec.jsx',
    ]) {
      expect(isReviewableGateFile(testFile)).toBe(false)
      expect(isCoverageEvidenceFile(testFile)).toBe(true)
    }
    // Non-test JS-flavored source stays reviewable and is not coverage evidence.
    expect(isReviewableGateFile('src/foo.mjs')).toBe(true)
    expect(isReviewableGateFile('src/foo.cjs')).toBe(true)
    expect(isReviewableGateFile('src/foo.jsx')).toBe(true)
    expect(isCoverageEvidenceFile('src/foo.mjs')).toBe(false)
  })
})
