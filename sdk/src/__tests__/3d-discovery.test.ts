import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { glob } from '../tools/glob'
import { createNodeFileSystem } from '../tools/node-filesystem'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('live 3D asset discovery', () => {
  test('glob finds metadata-only Blender assets from the real project tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-glob-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'assets'))
    fs.writeFileSync(
      path.join(root, 'assets', 'portfolio.blend'),
      Buffer.alloc(16),
    )
    fs.writeFileSync(path.join(root, 'assets', 'preview.png'), Buffer.alloc(16))

    const result = await glob({
      pattern: '**/*.blend',
      projectPath: root,
      fs: createNodeFileSystem(),
    })
    const part = result[0]
    if (part.type !== 'json') throw new Error('Expected JSON output')

    expect(part.value).toMatchObject({
      files: ['assets/portfolio.blend'],
      count: 1,
    })
  })
})
