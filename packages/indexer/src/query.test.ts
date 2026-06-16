import { describe, expect, test } from 'bun:test'

import { evaluateQueryIndexQuality, queryIndex } from './query'

import type { MetadataIndex } from './types'

const index: MetadataIndex = {
  version: '2',
  projectRoot: '/repo',
  builtAt: Date.now(),
  fileCount: 5,
  files: {
    'src/auth.ts': {
      path: 'src/auth.ts',
      mtime: 1,
      size: 100,
      hash: 'auth',
      ext: '.ts',
      symbols: ['AuthProvider', 'loginUser'],
      imports: ['./db'],
      headings: [],
      concepts: [],
    },
    'src/db.ts': {
      path: 'src/db.ts',
      mtime: 1,
      size: 100,
      hash: 'db',
      ext: '.ts',
      symbols: ['getUser'],
      imports: [],
      headings: [],
      concepts: [],
    },
    'docs/authentication.md': {
      path: 'docs/authentication.md',
      mtime: 1,
      size: 100,
      hash: 'docs',
      ext: '.md',
      symbols: [],
      imports: [],
      headings: ['Authentication Flow'],
      concepts: ['authentication', 'flow'],
    },
    'src/payments.ts': {
      path: 'src/payments.ts',
      mtime: 1,
      size: 100,
      hash: 'payments',
      ext: '.ts',
      symbols: ['chargeCard'],
      imports: [],
      headings: [],
      concepts: [],
    },
    '.bun-install/noisy.ts': {
      path: '.bun-install/noisy.ts',
      mtime: 1,
      size: 100,
      hash: 'noise',
      ext: '.ts',
      symbols: ['AuthProvider'],
      imports: [],
      headings: [],
      concepts: [],
    },
  },
  graph: {
    nodes: {
      'file:src/auth.ts': { id: 'file:src/auth.ts', type: 'file', label: 'src/auth.ts', path: 'src/auth.ts' },
      'file:src/db.ts': { id: 'file:src/db.ts', type: 'file', label: 'src/db.ts', path: 'src/db.ts' },
      'file:docs/authentication.md': { id: 'file:docs/authentication.md', type: 'file', label: 'docs/authentication.md', path: 'docs/authentication.md' },
      'file:.bun-install/noisy.ts': { id: 'file:.bun-install/noisy.ts', type: 'file', label: '.bun-install/noisy.ts', path: '.bun-install/noisy.ts' },
      'symbol:AuthProvider': { id: 'symbol:AuthProvider', type: 'symbol', label: 'AuthProvider' },
      'concept:authentication': { id: 'concept:authentication', type: 'concept', label: 'authentication' },
    },
    edges: [
      { from: 'file:src/auth.ts', to: 'file:src/db.ts', type: 'references', weight: 0.9, label: './db' },
      { from: 'file:src/auth.ts', to: 'symbol:AuthProvider', type: 'defines', weight: 1, label: 'AuthProvider' },
      { from: 'file:.bun-install/noisy.ts', to: 'symbol:AuthProvider', type: 'defines', weight: 1, label: 'AuthProvider' },
      { from: 'file:docs/authentication.md', to: 'concept:authentication', type: 'mentions', weight: 0.6, label: 'authentication' },
      { from: 'file:src/auth.ts', to: 'concept:authentication', type: 'mentions', weight: 0.6, label: 'authentication' },
    ],
  },
}

describe('queryIndex', () => {
  test('boosts graph-related files and returns related file reasons', () => {
    const results = queryIndex(index, 'AuthProvider', { limit: 5 })

    expect(results[0]?.path).toBe('src/auth.ts')
    const dbResult = results.find((result) => result.path === 'src/db.ts')
    expect(dbResult?.matchedOn).toContain('graph')
    expect(dbResult?.relatedFiles?.[0]?.path).toBe('src/auth.ts')
  })

  test('supports doc concept matches', () => {
    const results = queryIndex(index, 'authentication', { limit: 5 })

    expect(results.some((result) => result.path === 'docs/authentication.md')).toBe(true)
    expect(results.some((result) => result.matchedOn.includes('concept'))).toBe(true)
  })

  test('supports neighbors mode from an explicit file', () => {
    const results = queryIndex(index, '', {
      mode: 'neighbors',
      from: 'src/auth.ts',
      limit: 5,
    })

    expect(results.map((result) => result.path)).toContain('src/db.ts')
    expect(results.map((result) => result.path)).toContain('docs/authentication.md')
  })

  test('supports path mode between explicit files', () => {
    const results = queryIndex(index, '', {
      mode: 'path',
      from: 'src/auth.ts',
      to: 'src/db.ts',
    })

    expect(results.map((result) => result.path)).toEqual(['src/auth.ts', 'src/db.ts'])
    expect(results[0]?.explanation).toContain('Graph path')
  })

  test('supports explain mode', () => {
    const results = queryIndex(index, 'AuthProvider', { mode: 'explain', limit: 1 })

    expect(results[0]?.explanation).toContain('Matched on')
  })

  test('penalizes explicit vendor/cache noise even when paths are shallow', () => {
    const results = queryIndex(index, 'AuthProvider', { limit: 5 })

    expect(results.findIndex((result) => result.path === 'src/auth.ts')).toBeLessThan(
      results.findIndex((result) => result.path === '.bun-install/noisy.ts'),
    )
  })

  test('evaluates query quality cases', () => {
    const report = evaluateQueryIndexQuality(index, [
      { query: 'AuthProvider', expectedPaths: ['src/auth.ts'] },
      { query: 'authentication flow', expectedPaths: ['docs/authentication.md'] },
    ])

    expect(report.total).toBe(2)
    expect(report.passed).toBe(2)
    expect(report.failed).toEqual([])
    expect(report.meanReciprocalRank).toBeGreaterThan(0)
  })

  test('prioritizes command sources for validation-suite queries', () => {
    const commandIndex = makeCommandIndex()
    const results = queryIndex(commandIndex, 'Run the broader project validation suite', {
      limit: 5,
    })

    expect(results[0]?.path).toBe('package.json')
    expect(results[0]?.matchedOn).toContain('command')
    expect(results[0]?.matchedSnippets).toContain('package script: typecheck=bun --filter=* run typecheck')
    expect(results.findIndex((result) => result.path === 'src/validation-error.ts')).toBeGreaterThan(
      results.findIndex((result) => result.path === 'package.json'),
    )
  })

  test('supports explicit commands mode for command discovery', () => {
    const commandIndex = makeCommandIndex()
    const results = queryIndex(commandIndex, 'typecheck lint build', {
      mode: 'commands',
      limit: 5,
    })

    expect(results.map((result) => result.path).slice(0, 3)).toEqual([
      'package.json',
      '.github/workflows/ci.yml',
      'docs/testing.md',
    ])
    expect(results[0]?.explanation).toContain('Snippets:')
  })

  test('does not treat generic command searches as command-discovery intent', () => {
    const commandIndex = makeCommandIndex()
    const results = queryIndex(commandIndex, 'command registry', {
      limit: 5,
    })

    expect(results[0]?.path).toBe('src/command-registry.ts')
    expect(results.findIndex((result) => result.path === 'package.json')).toBeGreaterThan(
      results.findIndex((result) => result.path === 'src/command-registry.ts'),
    )
  })
})

function makeCommandIndex(): MetadataIndex {
  return {
    version: '2',
    projectRoot: '/repo',
    builtAt: Date.now(),
    fileCount: 5,
    files: {
      'package.json': {
        path: 'package.json',
        mtime: 1,
        size: 100,
        hash: 'pkg',
        ext: '.json',
        symbols: [],
        imports: [],
        headings: [],
        concepts: [
          'package manifest',
          'package scripts',
          'command configuration',
          'script:typecheck=bun --filter=* run typecheck',
          'script:test=bun test',
          'script:build=bun run build',
        ],
      },
      '.github/workflows/ci.yml': {
        path: '.github/workflows/ci.yml',
        mtime: 1,
        size: 100,
        hash: 'ci',
        ext: '.yml',
        symbols: [],
        imports: [],
        headings: [],
        concepts: ['ci workflow', 'validation suite', 'run:bun run typecheck', 'run:bun test'],
      },
      'docs/testing.md': {
        path: 'docs/testing.md',
        mtime: 1,
        size: 100,
        hash: 'docs-testing',
        ext: '.md',
        symbols: [],
        imports: [],
        headings: ['Testing and validation'],
        concepts: ['testing', 'validation', 'commands'],
      },
      'src/validation-error.ts': {
        path: 'src/validation-error.ts',
        mtime: 1,
        size: 100,
        hash: 'validation',
        ext: '.ts',
        symbols: ['ValidationError', 'formatValidationError'],
        imports: [],
        headings: [],
        concepts: ['validation', 'error', 'formatting'],
      },
      'src/command-registry.ts': {
        path: 'src/command-registry.ts',
        mtime: 1,
        size: 100,
        hash: 'command-registry',
        ext: '.ts',
        symbols: ['CommandRegistry', 'registerCommand'],
        imports: [],
        headings: [],
        concepts: ['command', 'registry', 'routing'],
      },
    },
    graph: { nodes: {}, edges: [] },
  }
}
