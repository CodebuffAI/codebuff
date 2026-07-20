import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_LEXICAL_WEIGHTS,
  evaluateQueryIndexQuality,
  queryIndex,
  resolveLexicalWeights,
  symbolMatchesToken,
} from './query'

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
      'file:src/auth.ts': {
        id: 'file:src/auth.ts',
        type: 'file',
        label: 'src/auth.ts',
        path: 'src/auth.ts',
      },
      'file:src/db.ts': {
        id: 'file:src/db.ts',
        type: 'file',
        label: 'src/db.ts',
        path: 'src/db.ts',
      },
      'file:docs/authentication.md': {
        id: 'file:docs/authentication.md',
        type: 'file',
        label: 'docs/authentication.md',
        path: 'docs/authentication.md',
      },
      'file:.bun-install/noisy.ts': {
        id: 'file:.bun-install/noisy.ts',
        type: 'file',
        label: '.bun-install/noisy.ts',
        path: '.bun-install/noisy.ts',
      },
      'symbol:AuthProvider': {
        id: 'symbol:AuthProvider',
        type: 'symbol',
        label: 'AuthProvider',
      },
      'concept:authentication': {
        id: 'concept:authentication',
        type: 'concept',
        label: 'authentication',
      },
    },
    edges: [
      {
        from: 'file:src/auth.ts',
        to: 'file:src/db.ts',
        type: 'references',
        weight: 0.9,
        label: './db',
      },
      {
        from: 'file:src/auth.ts',
        to: 'symbol:AuthProvider',
        type: 'defines',
        weight: 1,
        label: 'AuthProvider',
      },
      {
        from: 'file:.bun-install/noisy.ts',
        to: 'symbol:AuthProvider',
        type: 'defines',
        weight: 1,
        label: 'AuthProvider',
      },
      {
        from: 'file:docs/authentication.md',
        to: 'concept:authentication',
        type: 'mentions',
        weight: 0.6,
        label: 'authentication',
      },
      {
        from: 'file:src/auth.ts',
        to: 'concept:authentication',
        type: 'mentions',
        weight: 0.6,
        label: 'authentication',
      },
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

    expect(
      results.some((result) => result.path === 'docs/authentication.md'),
    ).toBe(true)
    expect(results.some((result) => result.matchedOn.includes('concept'))).toBe(
      true,
    )
  })

  test('applies directory prefixes before ranking and related-file output', () => {
    const results = queryIndex(index, 'authentication AuthProvider', {
      limit: 5,
      pathPrefixes: ['docs'],
    })

    expect(results.map((result) => result.path)).toEqual([
      'docs/authentication.md',
    ])
    expect(
      results
        .flatMap((result) => result.relatedFiles ?? [])
        .every((related) => related.path.startsWith('docs/')),
    ).toBe(true)
  })

  test('supports neighbors mode from an explicit file', () => {
    const results = queryIndex(index, '', {
      mode: 'neighbors',
      from: 'src/auth.ts',
      limit: 5,
    })

    expect(results.map((result) => result.path)).toContain('src/db.ts')
    expect(results.map((result) => result.path)).toContain(
      'docs/authentication.md',
    )
  })

  test('supports path mode between explicit files', () => {
    const results = queryIndex(index, '', {
      mode: 'path',
      from: 'src/auth.ts',
      to: 'src/db.ts',
    })

    expect(results.map((result) => result.path)).toEqual([
      'src/auth.ts',
      'src/db.ts',
    ])
    expect(results[0]?.explanation).toContain('Graph path')
  })

  test('supports explain mode', () => {
    const results = queryIndex(index, 'AuthProvider', {
      mode: 'explain',
      limit: 1,
    })

    expect(results[0]?.explanation).toContain('Matched on')
    expect(results[0]?.explanation).toContain('Index age:')
  })

  test('penalizes explicit vendor/cache noise even when paths are shallow', () => {
    const results = queryIndex(index, 'AuthProvider', { limit: 5 })

    expect(
      results.findIndex((result) => result.path === 'src/auth.ts'),
    ).toBeLessThan(
      results.findIndex((result) => result.path === '.bun-install/noisy.ts'),
    )
  })

  test('evaluates query quality cases', () => {
    const report = evaluateQueryIndexQuality(index, [
      { query: 'AuthProvider', expectedPaths: ['src/auth.ts'] },
      {
        query: 'authentication flow',
        expectedPaths: ['docs/authentication.md'],
      },
    ])

    expect(report.total).toBe(2)
    expect(report.passed).toBe(2)
    expect(report.failed).toEqual([])
    expect(report.meanReciprocalRank).toBeGreaterThan(0)
  })

  test('prioritizes command sources for validation-suite queries', () => {
    const commandIndex = makeCommandIndex()
    const results = queryIndex(
      commandIndex,
      'Run the broader project validation suite',
      {
        limit: 5,
      },
    )

    expect(results[0]?.path).toBe('package.json')
    expect(results[0]?.matchedOn).toContain('command')
    expect(results[0]?.matchedSnippets).toContain(
      'package script: typecheck=bun --filter=* run typecheck',
    )
    expect(
      results.findIndex((result) => result.path === 'src/validation-error.ts'),
    ).toBeGreaterThan(
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
    expect(
      results.findIndex((result) => result.path === 'package.json'),
    ).toBeGreaterThan(
      results.findIndex((result) => result.path === 'src/command-registry.ts'),
    )
  })

  test('normalizes fileTypes filters by dot prefix and casing', () => {
    const results = queryIndex(index, 'Authentication Flow', {
      fileTypes: ['.MD'],
      limit: 5,
    })

    expect(results.map((result) => result.path)).toEqual([
      'docs/authentication.md',
    ])
  })

  test('resolveLexicalWeights returns historical defaults with no arg', () => {
    expect(resolveLexicalWeights()).toEqual(DEFAULT_LEXICAL_WEIGHTS)
    expect(resolveLexicalWeights()).toEqual({
      fileName: 5,
      path: 2,
      symbol: 3,
      heading: 2.5,
      concept: 1.5,
      import: 1,
    })
  })

  test('resolveLexicalWeights overrides only the specified field', () => {
    const resolved = resolveLexicalWeights({ symbol: 100 })
    expect(resolved.symbol).toBe(100)
    expect(resolved.fileName).toBe(DEFAULT_LEXICAL_WEIGHTS.fileName)
    expect(resolved.path).toBe(DEFAULT_LEXICAL_WEIGHTS.path)
    expect(resolved.heading).toBe(DEFAULT_LEXICAL_WEIGHTS.heading)
    expect(resolved.concept).toBe(DEFAULT_LEXICAL_WEIGHTS.concept)
    expect(resolved.import).toBe(DEFAULT_LEXICAL_WEIGHTS.import)
  })

  test('resolveLexicalWeights ignores non-finite values', () => {
    const resolved = resolveLexicalWeights({
      symbol: Number.NaN,
      path: Number.POSITIVE_INFINITY,
    })
    expect(resolved.symbol).toBe(DEFAULT_LEXICAL_WEIGHTS.symbol)
    expect(resolved.path).toBe(DEFAULT_LEXICAL_WEIGHTS.path)
  })

  test('resolveLexicalWeights ignores negative values', () => {
    const resolved = resolveLexicalWeights({
      symbol: -3,
      path: -0.5,
    })
    expect(resolved.symbol).toBe(DEFAULT_LEXICAL_WEIGHTS.symbol)
    expect(resolved.path).toBe(DEFAULT_LEXICAL_WEIGHTS.path)
  })

  test('zeroing the lexical symbol weight down-ranks a symbol-heavy match', () => {
    const defaultResults = queryIndex(index, 'AuthProvider', { limit: 5 })
    const zeroedResults = queryIndex(index, 'AuthProvider', {
      lexicalWeights: { symbol: 0 },
      limit: 5,
    })

    const defaultAuthScore =
      defaultResults.find((result) => result.path === 'src/auth.ts')?.score ?? 0
    const zeroedAuthScore =
      zeroedResults.find((result) => result.path === 'src/auth.ts')?.score ?? 0

    // 'AuthProvider' -> ['auth','provider']; auth.ts matches 'provider' via its
    // symbol, so zeroing the symbol weight removes that contribution.
    expect(defaultAuthScore).toBeGreaterThan(0)
    expect(zeroedAuthScore).toBeLessThan(defaultAuthScore)
  })

  test('references mode returns files that import the seed file', () => {
    // src/auth.ts imports ./db, so querying references for src/db.ts should
    // surface src/auth.ts as the importer.
    const results = queryIndex(index, 'db', {
      mode: 'references',
      from: 'src/db.ts',
      limit: 10,
    })

    expect(results.length).toBe(1)
    expect(results[0]?.path).toBe('src/auth.ts')
    expect(results[0]?.matchedOn).toContain('graph')
    expect(results[0]?.explanation).toContain('imports this file')
    expect(results[0]?.explanation).toContain('./db')
    expect(results[0]?.relatedFiles?.[0]?.path).toBe('src/db.ts')
    expect(results[0]?.relatedFiles?.[0]?.reason).toContain('imports this file')
  })

  test('references mode is directional — does not return files the seed imports', () => {
    // src/auth.ts imports ./db. Querying references for src/auth.ts should NOT
    // return src/db.ts, because db.ts is the import target, not an importer of
    // auth.ts.
    const results = queryIndex(index, 'auth', {
      mode: 'references',
      from: 'src/auth.ts',
      limit: 10,
    })

    expect(results.length).toBe(0)
  })

  test('references mode returns empty for a file with no inbound reference edges', () => {
    // src/payments.ts has no graph node, so it has no inbound edges.
    const results = queryIndex(index, 'payments', {
      mode: 'references',
      from: 'src/payments.ts',
      limit: 10,
    })

    expect(results).toEqual([])
  })

  test('references mode resolves the seed from query tokens when from is omitted', () => {
    // Without `from`, findSeedPaths resolves the seed from the query tokens.
    // Querying 'db' should resolve to src/db.ts, then return its importers.
    const results = queryIndex(index, 'db', {
      mode: 'references',
      limit: 10,
    })

    expect(results.length).toBe(1)
    expect(results[0]?.path).toBe('src/auth.ts')
  })

  test('references mode resolves the seed from to when from is omitted', () => {
    // Without `from`, the seed falls back to `to`. Seeding via `to: 'src/db.ts'`
    // (no `from`, no `query`) should return its importers, same as seeding via
    // `from`.
    const results = queryIndex(index, '', {
      mode: 'references',
      to: 'src/db.ts',
      limit: 10,
    })

    expect(results.length).toBe(1)
    expect(results[0]?.path).toBe('src/auth.ts')
    expect(results[0]?.matchedOn).toContain('graph')
    expect(results[0]?.explanation).toContain('imports this file')
    expect(results[0]?.explanation).toContain('./db')
    expect(results[0]?.relatedFiles?.[0]?.path).toBe('src/db.ts')
    expect(results[0]?.relatedFiles?.[0]?.reason).toContain('imports this file')
  })

  test('references mode falls back to `to` when `from` is not in the index', () => {
    // When `from` names a path that is not indexed but `to` is, the seed must
    // resolve from `to` rather than silently degrading to token scoring.
    const results = queryIndex(index, '', {
      mode: 'references',
      from: 'src/does-not-exist.ts',
      to: 'src/db.ts',
      limit: 10,
    })

    expect(results.length).toBe(1)
    expect(results[0]?.path).toBe('src/auth.ts')
    expect(results[0]?.relatedFiles?.[0]?.path).toBe('src/db.ts')
  })

  test('references mode labels statically resolved calls as requiring verification', () => {
    // Call edges are conservative static evidence, but dynamic dispatch still
    // requires live verification before an edit relies on the relationship.
    const callsIndex: MetadataIndex = {
      ...index,
      graph: {
        nodes: index.graph.nodes,
        edges: [
          ...index.graph.edges,
          {
            from: 'file:src/payments.ts',
            to: 'file:src/auth.ts',
            type: 'calls',
            weight: 0.5,
            label: 'loginUser',
          },
        ],
      },
      files: {
        ...index.files,
        'src/payments.ts': {
          ...index.files['src/payments.ts'],
          symbols: ['processPayment', 'loginUser'],
        },
      },
    }
    // Add the missing graph node for payments so the edge is reachable.
    callsIndex.graph.nodes = {
      ...callsIndex.graph.nodes,
      'file:src/payments.ts': {
        id: 'file:src/payments.ts',
        type: 'file',
        label: 'src/payments.ts',
        path: 'src/payments.ts',
      },
    }

    const results = queryIndex(callsIndex, 'auth', {
      mode: 'references',
      from: 'src/auth.ts',
      limit: 10,
    })

    const paymentsResult = results.find((r) => r.path === 'src/payments.ts')
    expect(paymentsResult).toBeDefined()
    expect(paymentsResult?.explanation).toContain('calls a symbol defined here')
    expect(paymentsResult?.explanation).toContain('loginUser')
    expect(paymentsResult?.explanation).toContain('statically resolved')
    expect(paymentsResult?.explanation).toContain('verify dynamic dispatch')
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
        concepts: [
          'ci workflow',
          'validation suite',
          'run:bun run typecheck',
          'run:bun test',
        ],
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

describe('symbolMatchesToken', () => {
  test('matches when the token is a substring of the symbol (forward)', () => {
    expect(symbolMatchesToken('authprovider', 'auth')).toBe(true)
  })

  test('matches a substantial symbol (>= 4 chars) inside the token (reverse)', () => {
    expect(symbolMatchesToken('user', 'getuser')).toBe(true)
  })

  test('does not reverse-match a short symbol (< 4 chars) inside the token', () => {
    // 'db' is only 2 chars, so it must not match a token that merely contains
    // it; the reverse-substring rule only applies to symbols >= 4 chars.
    expect(symbolMatchesToken('db', 'somedbthing')).toBe(false)
  })

  test('does not match unrelated symbol and token', () => {
    expect(symbolMatchesToken('login', 'auth')).toBe(false)
  })
})
