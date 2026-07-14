import { describe, expect, test } from 'bun:test'

import { buildIndexQueryData } from './query-data'
import { queryIndex } from './query'

import type { IndexedFile, MetadataIndex } from './types'

describe('persisted query accelerators', () => {
  test('scores posting candidates without enumerating the full file corpus', () => {
    const files: Record<string, IndexedFile> = {}
    for (let i = 0; i < 5_000; i++) {
      const path = `src/generated/file-${i}.ts`
      files[path] = {
        path,
        mtime: 1,
        size: 1,
        hash: String(i),
        ext: '.ts',
        symbols: i === 4_321 ? ['NeedleService'] : [`Generated${i}`],
        imports: [],
        headings: [],
        concepts: [],
      }
    }
    const graph = { nodes: {}, edges: [] }
    const queryData = buildIndexQueryData(files, graph)
    const guardedFiles = new Proxy(files, {
      ownKeys() {
        throw new Error('full corpus enumeration is not allowed on query path')
      },
    })
    const index: MetadataIndex = {
      version: '2',
      projectRoot: '/project',
      builtAt: Date.now(),
      fileCount: 5_000,
      files: guardedFiles,
      graph,
      queryData,
    }

    const results = queryIndex(index, 'needle service', { limit: 5 })
    expect(results[0]?.path).toBe('src/generated/file-4321.ts')
  })

  test('persists adjacency as edge indexes rather than rebuilding relationships', () => {
    const file: IndexedFile = {
      path: 'a.ts',
      mtime: 1,
      size: 1,
      hash: 'a',
      ext: '.ts',
      symbols: ['alpha'],
      imports: [],
      headings: [],
      concepts: [],
    }
    const graph = {
      nodes: {
        'file:a.ts': {
          id: 'file:a.ts',
          type: 'file' as const,
          label: 'a.ts',
          path: 'a.ts',
        },
        'symbol:.ts:a.ts#alpha': {
          id: 'symbol:.ts:a.ts#alpha',
          type: 'symbol' as const,
          label: 'alpha',
          path: 'a.ts',
        },
      },
      edges: [
        {
          from: 'file:a.ts',
          to: 'symbol:.ts:a.ts#alpha',
          type: 'defines' as const,
          weight: 1,
        },
      ],
    }
    const data = buildIndexQueryData({ 'a.ts': file }, graph)
    expect(data.adjacency['file:a.ts']).toEqual([0])
    expect(data.adjacency['symbol:.ts:a.ts#alpha']).toEqual([0])
  })
})
