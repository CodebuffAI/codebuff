import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { flattenTree, getProjectFileTree } from '../project-file-tree'
import { detectEngineProfiles } from '../util/engine-profiles'

import type { CodebuffFileSystem } from '../types/filesystem'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('3D asset file-tree discovery', () => {
  test('keeps 3D assets as metadata-only nodes while excluding other binaries', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-tree-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'assets'))
    fs.writeFileSync(
      path.join(root, 'assets', 'portfolio.blend'),
      Buffer.alloc(37),
    )
    fs.writeFileSync(path.join(root, 'assets', 'preview.png'), Buffer.alloc(19))
    fs.writeFileSync(path.join(root, 'README.md'), '# Portfolio\n')
    fs.mkdirSync(path.join(root, '.openbuff', 'artifacts', '3d'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(root, '.openbuff', 'artifacts', '3d', 'receipt.json'),
      '{}',
    )

    const tree = await getProjectFileTree({
      projectRoot: root,
      fs: fs.promises as CodebuffFileSystem,
    })
    const files = flattenTree(tree)
    const blend = files.find(
      (file) => file.filePath === 'assets/portfolio.blend',
    )

    expect(blend?.asset).toEqual({
      kind: '3d',
      format: 'blend',
      sizeBytes: 37,
    })
    expect(files.some((file) => file.filePath === 'assets/preview.png')).toBe(
      false,
    )
    expect(
      files.some((file) => file.filePath.includes('.openbuff/artifacts')),
    ).toBe(false)
    expect(detectEngineProfiles(tree).map((profile) => profile.id)).toContain(
      'blender',
    )
  })
})
