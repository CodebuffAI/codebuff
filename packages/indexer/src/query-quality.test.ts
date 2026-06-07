import { describe, expect, test } from 'bun:test'

import { evaluateQueryIndexQuality } from './query'

import type { MetadataIndex } from './types'

const benchmarkIndex: MetadataIndex = {
  version: '2',
  projectRoot: '/repo',
  builtAt: 1,
  fileCount: 5,
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
  },
  graph: {
    nodes: {
      'file:packages/indexer/src/query.ts': { id: 'file:packages/indexer/src/query.ts', type: 'file', label: 'packages/indexer/src/query.ts', path: 'packages/indexer/src/query.ts' },
      'file:packages/indexer/src/metadata-indexer.ts': { id: 'file:packages/indexer/src/metadata-indexer.ts', type: 'file', label: 'packages/indexer/src/metadata-indexer.ts', path: 'packages/indexer/src/metadata-indexer.ts' },
      'file:common/src/tools/params/tool/query-index.ts': { id: 'file:common/src/tools/params/tool/query-index.ts', type: 'file', label: 'common/src/tools/params/tool/query-index.ts', path: 'common/src/tools/params/tool/query-index.ts' },
      'file:docs/agents-and-tools.md': { id: 'file:docs/agents-and-tools.md', type: 'file', label: 'docs/agents-and-tools.md', path: 'docs/agents-and-tools.md' },
      'file:.bun-install/install/cache/query-index.ts': { id: 'file:.bun-install/install/cache/query-index.ts', type: 'file', label: '.bun-install/install/cache/query-index.ts', path: '.bun-install/install/cache/query-index.ts' },
      'symbol:queryIndex': { id: 'symbol:queryIndex', type: 'symbol', label: 'queryIndex' },
      'concept:graph': { id: 'concept:graph', type: 'concept', label: 'graph' },
    },
    edges: [
      { from: 'file:packages/indexer/src/query.ts', to: 'symbol:queryIndex', type: 'defines', weight: 1, label: 'queryIndex' },
      { from: 'file:.bun-install/install/cache/query-index.ts', to: 'symbol:queryIndex', type: 'defines', weight: 1, label: 'queryIndex' },
      { from: 'file:docs/agents-and-tools.md', to: 'concept:graph', type: 'mentions', weight: 0.6, label: 'graph' },
      { from: 'file:packages/indexer/src/query.ts', to: 'concept:graph', type: 'mentions', weight: 0.6, label: 'graph' },
      { from: 'file:common/src/tools/params/tool/query-index.ts', to: 'file:packages/indexer/src/query.ts', type: 'references', weight: 0.9, label: 'query_index' },
    ],
  },
}

describe('query index quality benchmark', () => {
  test('keeps representative query_index targets discoverable', () => {
    const report = evaluateQueryIndexQuality(benchmarkIndex, [
      { query: 'queryIndex ranking implementation', expectedPaths: ['packages/indexer/src/query.ts'] },
      { query: 'graph modes documentation', expectedPaths: ['docs/agents-and-tools.md'] },
      { query: 'query_index schema params', expectedPaths: ['common/src/tools/params/tool/query-index.ts'] },
      {
        query: 'metadata graph builder',
        expectedPaths: ['packages/indexer/src/metadata-indexer.ts'],
      },
    ])

    expect(report).toMatchObject({ total: 4, passed: 4, failed: [] })
    expect(report.meanReciprocalRank).toBeGreaterThanOrEqual(0.8)
  })
})
