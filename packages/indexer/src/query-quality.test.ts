import { describe, expect, test } from 'bun:test'

import { evaluateQueryIndexQuality, queryIndex } from './query'
import {
  buildRepoMap,
  compareRetrievalStrategies,
  formatRetrievalComparisonReport,
  queryRepoMap,
} from './index'

import type { MetadataIndex } from './types'

const benchmarkIndex: MetadataIndex = {
  version: '2',
  projectRoot: '/repo',
  builtAt: 1,
  fileCount: 13,
  files: {
    'packages/indexer/src/query.ts': {
      path: 'packages/indexer/src/query.ts',
      mtime: 1,
      size: 100,
      hash: 'query',
      ext: '.ts',
      symbols: ['queryIndex', 'evaluateQueryIndexQuality'],
      imports: ['./types'],
      headings: [],
      concepts: [],
    },
    'packages/indexer/src/metadata-indexer.ts': {
      path: 'packages/indexer/src/metadata-indexer.ts',
      mtime: 1,
      size: 100,
      hash: 'metadata',
      ext: '.ts',
      symbols: ['buildMetadataIndex', 'updateMetadataIndex'],
      imports: ['./file-walker', './index-store'],
      headings: [],
      concepts: [],
    },
    'common/src/tools/params/tool/query-index.ts': {
      path: 'common/src/tools/params/tool/query-index.ts',
      mtime: 1,
      size: 100,
      hash: 'schema',
      ext: '.ts',
      symbols: ['queryIndexParams'],
      imports: ['zod'],
      headings: [],
      concepts: [],
    },
    'docs/agents-and-tools.md': {
      path: 'docs/agents-and-tools.md',
      mtime: 1,
      size: 100,
      hash: 'docs',
      ext: '.md',
      symbols: [],
      imports: [],
      headings: ['Query index', 'Graph modes'],
      concepts: ['query', 'index', 'graph', 'modes'],
    },
    '.bun-install/install/cache/query-index.ts': {
      path: '.bun-install/install/cache/query-index.ts',
      mtime: 1,
      size: 100,
      hash: 'noise',
      ext: '.ts',
      symbols: ['queryIndex'],
      imports: [],
      headings: [],
      concepts: [],
    },
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
        'package scripts',
        'command configuration',
        'script:typecheck=bun run typecheck',
        'script:test=bun test',
      ],
    },
    'src/validation-error.ts': {
      path: 'src/validation-error.ts',
      mtime: 1,
      size: 100,
      hash: 'validation',
      ext: '.ts',
      symbols: ['formatValidationError'],
      imports: [],
      headings: [],
      concepts: ['validation', 'error'],
    },
    'services/payments/ledger.py': {
      path: 'services/payments/ledger.py',
      mtime: 1,
      size: 100,
      hash: 'ledger',
      ext: '.py',
      symbols: ['LedgerEntry', 'reconcile_accounts'],
      imports: ['decimal'],
      headings: [],
      concepts: ['payments', 'ledger', 'reconciliation'],
    },
    'crates/auth/src/session.rs': {
      path: 'crates/auth/src/session.rs',
      mtime: 1,
      size: 100,
      hash: 'session',
      ext: '.rs',
      symbols: ['SessionStore', 'refresh_token'],
      imports: ['serde'],
      headings: [],
      concepts: ['auth', 'session', 'token'],
    },
    'cmd/server/routes.go': {
      path: 'cmd/server/routes.go',
      mtime: 1,
      size: 100,
      hash: 'routes',
      ext: '.go',
      symbols: ['RegisterRoutes', 'healthHandler'],
      imports: ['net/http'],
      headings: [],
      concepts: ['server', 'routes', 'health'],
    },
    'agents/idioms/python.md': {
      path: 'agents/idioms/python.md',
      mtime: 1,
      size: 100,
      hash: 'python-idioms',
      ext: '.md',
      symbols: [],
      imports: [],
      headings: ['Python idioms'],
      concepts: [
        'python',
        'idiom',
        'pathlib',
        'context managers',
        'comprehensions',
      ],
    },
    'agents/idioms/rust.md': {
      path: 'agents/idioms/rust.md',
      mtime: 1,
      size: 100,
      hash: 'rust-idioms',
      ext: '.md',
      symbols: [],
      imports: [],
      headings: ['Rust idioms'],
      concepts: ['rust', 'idiom', 'ownership', 'borrowing', 'result', 'option'],
    },
    'agents/idioms/go.md': {
      path: 'agents/idioms/go.md',
      mtime: 1,
      size: 100,
      hash: 'go-idioms',
      ext: '.md',
      symbols: [],
      imports: [],
      headings: ['Go idioms'],
      concepts: ['go', 'idiom', 'errors', 'wrapping', 'gofmt', 'interfaces'],
    },
  },
  graph: {
    nodes: {
      'file:packages/indexer/src/query.ts': {
        id: 'file:packages/indexer/src/query.ts',
        type: 'file',
        label: 'packages/indexer/src/query.ts',
        path: 'packages/indexer/src/query.ts',
      },
      'file:packages/indexer/src/metadata-indexer.ts': {
        id: 'file:packages/indexer/src/metadata-indexer.ts',
        type: 'file',
        label: 'packages/indexer/src/metadata-indexer.ts',
        path: 'packages/indexer/src/metadata-indexer.ts',
      },
      'file:common/src/tools/params/tool/query-index.ts': {
        id: 'file:common/src/tools/params/tool/query-index.ts',
        type: 'file',
        label: 'common/src/tools/params/tool/query-index.ts',
        path: 'common/src/tools/params/tool/query-index.ts',
      },
      'file:docs/agents-and-tools.md': {
        id: 'file:docs/agents-and-tools.md',
        type: 'file',
        label: 'docs/agents-and-tools.md',
        path: 'docs/agents-and-tools.md',
      },
      'file:.bun-install/install/cache/query-index.ts': {
        id: 'file:.bun-install/install/cache/query-index.ts',
        type: 'file',
        label: '.bun-install/install/cache/query-index.ts',
        path: '.bun-install/install/cache/query-index.ts',
      },
      'symbol:queryIndex': {
        id: 'symbol:queryIndex',
        type: 'symbol',
        label: 'queryIndex',
      },
      'concept:graph': { id: 'concept:graph', type: 'concept', label: 'graph' },
    },
    edges: [
      {
        from: 'file:packages/indexer/src/query.ts',
        to: 'symbol:queryIndex',
        type: 'defines',
        weight: 1,
        label: 'queryIndex',
      },
      {
        from: 'file:.bun-install/install/cache/query-index.ts',
        to: 'symbol:queryIndex',
        type: 'defines',
        weight: 1,
        label: 'queryIndex',
      },
      {
        from: 'file:docs/agents-and-tools.md',
        to: 'concept:graph',
        type: 'mentions',
        weight: 0.6,
        label: 'graph',
      },
      {
        from: 'file:packages/indexer/src/query.ts',
        to: 'concept:graph',
        type: 'mentions',
        weight: 0.6,
        label: 'graph',
      },
      {
        from: 'file:common/src/tools/params/tool/query-index.ts',
        to: 'file:packages/indexer/src/query.ts',
        type: 'references',
        weight: 0.9,
        label: 'query_index',
      },
    ],
  },
}

describe('query index quality benchmark', () => {
  test('keeps representative query_index targets discoverable', () => {
    const report = evaluateQueryIndexQuality(benchmarkIndex, [
      {
        query: 'queryIndex ranking implementation',
        expectedPaths: ['packages/indexer/src/query.ts'],
      },
      {
        query: 'graph modes documentation',
        expectedPaths: ['docs/agents-and-tools.md'],
      },
      {
        query: 'query_index schema params',
        expectedPaths: ['common/src/tools/params/tool/query-index.ts'],
      },
      {
        query: 'metadata graph builder',
        expectedPaths: ['packages/indexer/src/metadata-indexer.ts'],
      },
      {
        query: 'run validation suite',
        expectedPaths: ['package.json'],
      },
    ])

    expect(report).toMatchObject({ total: 5, passed: 5, failed: [] })
    expect(report.meanReciprocalRank).toBeGreaterThanOrEqual(0.8)
  })

  test('prefers same-language idiom guidance before non-TS edits', () => {
    const cases = [
      {
        query:
          'python pathlib context managers idiom guidance before editing ledger.py',
        expectedPath: 'agents/idioms/python.md',
      },
      {
        query:
          'rust Result ownership borrowing idiom guidance before editing session.rs',
        expectedPath: 'agents/idioms/rust.md',
      },
      {
        query:
          'go error wrapping gofmt idiom guidance before editing routes.go',
        expectedPath: 'agents/idioms/go.md',
      },
    ]

    for (const testCase of cases) {
      const results = queryIndex(benchmarkIndex, testCase.query, {
        fileTypes: ['md'],
        limit: 3,
      })
      expect(results[0]?.path).toBe(testCase.expectedPath)
    }
  })

  test('compares query_index with repo-map retrieval on non-TS fixtures', () => {
    const cases = [
      {
        query: 'python ledger reconciliation',
        expectedPaths: ['services/payments/ledger.py'],
      },
      {
        query: 'rust auth session token',
        expectedPaths: ['crates/auth/src/session.rs'],
      },
      {
        query: 'go server route registration',
        expectedPaths: ['cmd/server/routes.go'],
      },
    ]

    const report = compareRetrievalStrategies(benchmarkIndex, cases)

    expect(report.total).toBe(3)
    expect(report.queryIndex).toMatchObject({ passed: 3, failed: [] })
    expect(report.repoMap).toMatchObject({ passed: 3, failed: [] })
    expect(report.repoMap.meanReciprocalRank).toBeGreaterThanOrEqual(0.75)
  })

  test('renders a deterministic repo map and queryable comparison report', () => {
    const repoMap = buildRepoMap(benchmarkIndex, {
      fileTypes: ['py', 'rs', 'go'],
      maxSymbolsPerFile: 1,
    })

    expect(repoMap.entries.map((entry) => entry.path)).toEqual([
      'cmd/server/routes.go',
      'crates/auth/src/session.rs',
      'services/payments/ledger.py',
    ])
    expect(repoMap.map).toContain('cmd/server/routes.go (.go)')
    expect(repoMap.map).toContain('symbols: RegisterRoutes')
    expect(repoMap.map).not.toContain('healthHandler')

    const results = queryRepoMap(benchmarkIndex, 'refresh token session', {
      fileTypes: ['rs'],
    })
    expect(results[0]).toMatchObject({
      path: 'crates/auth/src/session.rs',
      matchedOn: expect.arrayContaining(['symbol', 'concept']),
    })

    const report = compareRetrievalStrategies(benchmarkIndex, [
      { query: 'missing subsystem', expectedPaths: ['missing.ts'] },
    ])
    expect(formatRetrievalComparisonReport(report)).toContain(
      'repo_map: 0/1 passed, MRR 0.000',
    )
  })

  test('handles empty repo-map inputs without failures', () => {
    const emptyIndex: MetadataIndex = {
      version: '2',
      projectRoot: '/repo',
      builtAt: 1,
      fileCount: 0,
      files: {},
      graph: { nodes: {}, edges: [] },
    }

    expect(buildRepoMap(emptyIndex)).toEqual({ map: '', entries: [] })
    expect(queryRepoMap(emptyIndex, 'anything')).toEqual([])

    const report = compareRetrievalStrategies(emptyIndex, [])
    expect(report).toEqual({
      total: 0,
      queryIndex: { passed: 0, failed: [], meanReciprocalRank: 0 },
      repoMap: { passed: 0, failed: [], meanReciprocalRank: 0 },
    })
  })

  test('respects zero maxFiles and blank queries as empty boundaries', () => {
    expect(buildRepoMap(benchmarkIndex, { maxFiles: 0 })).toMatchObject({
      map: '',
      entries: [],
    })
    expect(queryRepoMap(benchmarkIndex, '')).toEqual([])
  })
})
