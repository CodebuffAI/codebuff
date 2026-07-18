import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { afterEach, describe, expect, test } from 'bun:test'

import { buildMetadataIndex, updateMetadataIndex } from './metadata-indexer'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('3D asset metadata indexing', () => {
  test('indexes large binary assets without parsing their payload as text', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-index-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'assets'))
    const content = Buffer.alloc(600_000, 0xff)
    fs.writeFileSync(path.join(root, 'assets', 'portfolio.blend'), content)
    const sourceHash = createHash('sha256').update(content).digest('hex')
    const metadataDirectory = path.join(
      root,
      '.openbuff',
      'artifacts',
      '3d',
      'metadata',
    )
    fs.mkdirSync(metadataDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(metadataDirectory, `${sourceHash}.json`),
      JSON.stringify({
        sourceHash,
        concepts: ['HeroModel', 'PortfolioMaterial', 'MainCamera'],
      }),
    )

    const index = await buildMetadataIndex(root)
    const asset = index.files['assets/portfolio.blend']

    expect(asset?.asset).toMatchObject({
      kind: '3d',
      format: 'blend',
      sizeBytes: 600_000,
    })
    expect(asset?.symbols).toEqual([])
    expect(asset?.imports).toEqual([])
    expect(asset?.concepts).toContain('3d asset')
    expect(asset?.concepts).toContain('HeroModel')
    expect(asset?.asset?.derivedMetadataPath).toBe(
      `.openbuff/artifacts/3d/metadata/${sourceHash}.json`,
    )
    expect(asset?.contentSample).toBe('blend 3D asset (600000 bytes)')
  })

  test('an incremental refresh picks up a new hash-bound inspection cache', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-index-'))
    roots.push(root)
    const content = Buffer.from('BLENDER-v300 metadata-only fixture')
    fs.writeFileSync(path.join(root, 'scene.blend'), content)
    const initial = await buildMetadataIndex(root)
    expect(initial.files['scene.blend']?.concepts).not.toContain('HeroModel')

    const sourceHash = createHash('sha256').update(content).digest('hex')
    const metadataDirectory = path.join(
      root,
      '.openbuff',
      'artifacts',
      '3d',
      'metadata',
    )
    fs.mkdirSync(metadataDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(metadataDirectory, `${sourceHash}.json`),
      JSON.stringify({ sourceHash, concepts: ['HeroModel'] }),
    )

    const refreshed = await updateMetadataIndex(initial, root)
    expect(refreshed.files['scene.blend']?.concepts).toContain('HeroModel')
  })
})
