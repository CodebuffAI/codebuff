import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  getIndexDir,
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

  test('persists semantic vectors by fingerprint and content hash', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'openbuff-semantic-cache-'),
    )
    await saveSemanticVectors(root, 'model-a', [
      { path: 'src/a.ts', hash: 'hash-a', vector: [1, 2] },
    ])

    expect(await loadSemanticVectors(root, 'model-a')).toEqual([
      { hash: 'hash-a', vector: [1, 2] },
    ])
    expect(await loadSemanticVectors(root, 'model-b')).toEqual([])
  })

  test('migrates the legacy path-oriented vector schema on the next save', async () => {
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

    expect(await loadSemanticVectors(root, 'legacy-model')).toEqual([
      { hash: 'same-content', vector: [0.5, 1] },
    ])
    await saveSemanticVectors(root, 'new-model', [
      { path: 'src/new.ts', hash: 'new-content', vector: [2, 3] },
    ])

    const migrated = JSON.parse(
      await fs.promises.readFile(
        path.join(dir, 'semantic-vectors.json'),
        'utf8',
      ),
    )
    expect(migrated.version).toBe('2')
    expect(migrated.fingerprints['legacy-model'].vectors).toEqual({
      'same-content': [0.5, 1],
    })
    expect(migrated.fingerprints['new-model'].vectors).toEqual({
      'new-content': [2, 3],
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
})
