import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  getIndexDir,
  loadIndex,
  loadSemanticVectors,
  sanitizeIndexCacheDir,
  saveIndex,
  saveSemanticVectors,
} from './index-store'

describe('index cache ownership', () => {
  test('accepts only a single hidden cache directory name', () => {
    expect(sanitizeIndexCacheDir('.custom-index')).toBe('.custom-index')
    expect(sanitizeIndexCacheDir('src')).toBe('.codebuff-index')
    expect(sanitizeIndexCacheDir('.cache/index')).toBe('.codebuff-index')
    expect(sanitizeIndexCacheDir('.git')).toBe('.codebuff-index')
  })

  test('refuses to claim a non-empty unowned directory', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-cache-owner-'),
    )
    const dir = getIndexDir(root, '.custom-index')
    await fs.promises.mkdir(dir)
    await fs.promises.writeFile(path.join(dir, 'user.txt'), 'mine')
    await expect(
      saveIndex(
        {
          version: '2',
          projectRoot: root,
          builtAt: Date.now(),
          fileCount: 0,
          files: {},
          graph: { nodes: {}, edges: [] },
        },
        root,
        '.custom-index',
      ),
    ).rejects.toThrow('non-owned')
  })

  test('persists semantic vectors by fingerprint and exact embedding hash', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-semantic-cache-'),
    )
    await saveSemanticVectors(root, 'model-a', [
      { path: 'src/a.ts', embeddingHash: 'embedding-a', vector: [1, 2] },
    ])

    expect(await loadSemanticVectors(root, 'model-a')).toEqual([
      { embeddingHash: 'embedding-a', vector: [1, 2] },
    ])
    expect(await loadSemanticVectors(root, 'model-b')).toEqual([])
  })

  test('rejects legacy content-hash vector schemas as unsafe cache misses', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-semantic-migration-'),
    )
    const dir = getIndexDir(root)
    await fs.promises.mkdir(dir)
    await fs.promises.writeFile(
      path.join(dir, 'semantic-vectors.json'),
      JSON.stringify({
        version: '1',
        projectRoot: root,
        fingerprint: 'legacy-model',
        vectors: [
          { path: 'old/name.ts', hash: 'same-content', vector: [0.5, 1] },
        ],
      }),
    )

    expect(await loadSemanticVectors(root, 'legacy-model')).toEqual([])
    await saveSemanticVectors(root, 'new-model', [
      { path: 'src/new.ts', embeddingHash: 'new-input', vector: [2, 3] },
    ])

    const migrated = JSON.parse(
      await fs.promises.readFile(
        path.join(dir, 'semantic-vectors.json'),
        'utf8',
      ),
    )
    expect(migrated.version).toBe('3')
    expect(migrated.fingerprints['legacy-model']).toBeUndefined()
    expect(migrated.fingerprints['new-model'].vectors).toEqual({
      'new-input': [2, 3],
    })
  })

  test('treats corrupt or foreign vector caches as safe misses', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-semantic-corrupt-'),
    )
    const dir = getIndexDir(root)
    await fs.promises.mkdir(dir)
    await fs.promises.writeFile(
      path.join(dir, 'semantic-vectors.json'),
      '{not json',
    )
    expect(await loadSemanticVectors(root, 'model')).toEqual([])

    await fs.promises.writeFile(
      path.join(dir, 'semantic-vectors.json'),
      JSON.stringify({
        version: '2',
        projectRoot: '/another/project',
        fingerprints: { model: { updatedAt: 1, vectors: { hash: [1] } } },
      }),
    )
    expect(await loadSemanticVectors(root, 'model')).toEqual([])
  })

  test('serializes concurrent metadata writes and preserves the newest snapshot', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-index-cas-'),
    )
    const base = {
      version: '2' as const,
      projectRoot: root,
      fileCount: 0,
      files: {},
      graph: { nodes: {}, edges: [] },
    }
    await Promise.all([
      saveIndex({ ...base, builtAt: 100 }, root),
      saveIndex({ ...base, builtAt: 200 }, root),
    ])
    expect((await loadIndex(root))?.builtAt).toBe(200)
  })

  test('supports compare-and-swap metadata persistence', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-index-explicit-cas-'),
    )
    const base = {
      version: '2' as const,
      projectRoot: root,
      fileCount: 0,
      files: {},
      graph: { nodes: {}, edges: [] },
    }
    expect(await saveIndex({ ...base, builtAt: 100 }, root)).toBe(true)
    expect(
      await saveIndex({ ...base, builtAt: 200 }, root, '.codebuff-index', {
        expectedBuiltAt: 50,
      }),
    ).toBe(false)
    expect((await loadIndex(root))?.builtAt).toBe(100)
    expect(
      await saveIndex({ ...base, builtAt: 200 }, root, '.codebuff-index', {
        expectedBuiltAt: 100,
      }),
    ).toBe(true)
    expect((await loadIndex(root))?.builtAt).toBe(200)
  })

  test('round-trips durable parse summaries and query accelerators', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-index-derived-data-'),
    )
    const file = {
      path: 'src/a.ts',
      mtime: 1,
      size: 1,
      hash: 'hash',
      ext: '.ts',
      symbols: ['alpha'],
      imports: [],
      headings: [],
      concepts: [],
    }
    await saveIndex(
      {
        version: '2',
        projectRoot: root,
        builtAt: 1,
        fileCount: 1,
        files: { 'src/a.ts': file },
        graph: { nodes: {}, edges: [] },
        parseData: {
          'src/a.ts': {
            identifiers: ['alpha'],
            calls: [],
            numLines: 1,
          },
        },
      },
      root,
    )

    const loaded = await loadIndex(root)
    expect(loaded?.parseData?.['src/a.ts']?.identifiers).toEqual(['alpha'])
    expect(loaded?.queryData?.postings.alpha).toEqual(['src/a.ts'])
  })

  test('merges concurrent semantic fingerprint writes under the cache lock', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-vector-lock-'),
    )
    await Promise.all([
      saveSemanticVectors(root, 'model-a', [
        { path: 'a.ts', embeddingHash: 'a', vector: [1] },
      ]),
      saveSemanticVectors(root, 'model-b', [
        { path: 'b.ts', embeddingHash: 'b', vector: [2] },
      ]),
    ])
    expect(await loadSemanticVectors(root, 'model-a')).toEqual([
      { embeddingHash: 'a', vector: [1] },
    ])
    expect(await loadSemanticVectors(root, 'model-b')).toEqual([
      { embeddingHash: 'b', vector: [2] },
    ])
  })
})
