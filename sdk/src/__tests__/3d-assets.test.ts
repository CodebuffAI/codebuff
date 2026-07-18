import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  edit3dAsset,
  inspect3dAsset,
  render3dPreview,
} from '../tools/3d-assets'
import { hashFileContent } from '../tools/filesystem-authority'
import { createNodeFileSystem } from '../tools/node-filesystem'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function makeGlb(document: object): Buffer {
  const json = Buffer.from(JSON.stringify(document), 'utf8')
  const paddedLength = Math.ceil(json.length / 4) * 4
  const output = Buffer.alloc(20 + paddedLength, 0x20)
  output.write('glTF', 0, 'ascii')
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(output.length, 8)
  output.writeUInt32LE(paddedLength, 12)
  output.writeUInt32LE(0x4e4f534a, 16)
  json.copy(output, 20)
  return output
}

function valueOf(result: Awaited<ReturnType<typeof inspect3dAsset>>) {
  const part = result[0]
  if (part.type !== 'json') throw new Error('Expected JSON output')
  return part.value as Record<string, any>
}

describe('inspect3dAsset', () => {
  test('summarizes glTF and GLB scene structure without Blender', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-tools-'))
    roots.push(root)
    const document = {
      asset: { version: '2.0' },
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'Hero', mesh: 0 }],
      meshes: [{ name: 'Body', primitives: [{ attributes: {} }] }],
      materials: [{ name: 'PortfolioMaterial' }],
      animations: [{ name: 'Idle' }],
    }
    fs.writeFileSync(path.join(root, 'scene.gltf'), JSON.stringify(document))
    fs.writeFileSync(path.join(root, 'scene.glb'), makeGlb(document))
    const fileSystem = createNodeFileSystem()

    for (const assetPath of ['scene.gltf', 'scene.glb']) {
      const value = valueOf(
        await inspect3dAsset({ path: assetPath, cwd: root, fs: fileSystem }),
      )
      expect(value.error).toBeUndefined()
      expect(value.summary.nodes[0].name).toBe('Hero')
      expect(value.summary.meshes[0]).toEqual({
        name: 'Body',
        primitiveCount: 1,
      })
      expect(value.summary.materials).toEqual(['PortfolioMaterial'])
      expect(value.summary.animations).toEqual(['Idle'])
      expect(value.sourceHash).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  test('summarizes OBJ geometry and rejects traversal', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-tools-'))
    roots.push(root)
    fs.writeFileSync(
      path.join(root, 'mesh.obj'),
      'mtllib scene.mtl\no Cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Red\nf 1 2 3\n',
    )
    const fileSystem = createNodeFileSystem()
    const value = valueOf(
      await inspect3dAsset({ path: 'mesh.obj', cwd: root, fs: fileSystem }),
    )
    expect(value.summary).toMatchObject({
      vertices: 3,
      faces: 1,
      objects: ['Cube'],
      materials: ['Red'],
      materialLibraries: ['scene.mtl'],
    })

    const escaped = valueOf(
      await inspect3dAsset({ path: '../mesh.obj', cwd: root, fs: fileSystem }),
    )
    expect(escaped.error).toContain('outside the project root')
  })

  test('applies the host file filter before inspecting an asset', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-tools-'))
    roots.push(root)
    fs.writeFileSync(path.join(root, 'private.obj'), 'v 0 0 0\n')

    const value = valueOf(
      await inspect3dAsset({
        path: 'private.obj',
        cwd: root,
        fs: createNodeFileSystem(),
        fileFilter: () => ({ status: 'blocked' }),
      }),
    )
    expect(value.error).toContain('authorized filesystem policy')
  })

  test('rejects a stale declarative edit before invoking Blender or writing artifacts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-tools-'))
    roots.push(root)
    fs.writeFileSync(path.join(root, 'scene.blend'), Buffer.from('fixture'))
    const fileSystem = Object.assign(createNodeFileSystem(), {
      mutationAuthority: 'cooperative_cas' as const,
      conditionalCommit: async () => ({ applied: true as const }),
    })

    const result = await edit3dAsset({
      path: 'scene.blend',
      sourceHash: '0'.repeat(64),
      operations: [{ type: 'rename_object', object: 'Cube', new_name: 'Hero' }],
      cwd: root,
      fs: fileSystem,
      operationId: '../../escape',
    })

    expect(result[0]).toMatchObject({
      type: 'json',
      value: {
        outcome: 'not_applied',
        errors: [{ message: expect.stringContaining('source hash is stale') }],
      },
    })
    expect(fs.existsSync(path.join(root, '.openbuff'))).toBe(false)
  })

  test('honors cancellation before starting a Blender render', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-3d-tools-'))
    roots.push(root)
    fs.writeFileSync(path.join(root, 'scene.blend'), Buffer.from('fixture'))
    const controller = new AbortController()
    controller.abort()

    const result = await render3dPreview({
      path: 'scene.blend',
      views: ['perspective'],
      mode: 'clay',
      width: 128,
      height: 128,
      cwd: root,
      fs: createNodeFileSystem(),
      signal: controller.signal,
    })
    expect(result[0]).toMatchObject({
      type: 'json',
      value: { error: 'Blender operation cancelled.' },
    })
    expect(fs.existsSync(path.join(root, '.openbuff'))).toBe(false)
  })

  test.skipIf(!fs.existsSync('/usr/bin/blender'))(
    'inspects, renders, and conditionally edits a real Blender scene',
    async () => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'openbuff-blender-e2e-'),
      )
      roots.push(root)
      const blendPath = path.join(root, 'portfolio.blend')
      const created = spawnSync(
        'blender',
        [
          '--background',
          '--python-expr',
          `import bpy; bpy.ops.mesh.primitive_cube_add(); bpy.context.object.name='PortfolioCube'; bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(blendPath)})`,
        ],
        { encoding: 'utf8', timeout: 60_000 },
      )
      expect(created.status).toBe(0)

      const baseFileSystem = createNodeFileSystem()
      const fileSystem = Object.assign(baseFileSystem, {
        mutationAuthority: 'cooperative_cas' as const,
        conditionalCommit: async (
          filePath: fs.PathLike,
          data: string | NodeJS.ArrayBufferView,
          options: { expectedHash: string | null },
        ) => {
          const before = Buffer.from(await fs.promises.readFile(filePath))
          if (hashFileContent(before) !== options.expectedHash) {
            return {
              applied: false as const,
              actualHash: hashFileContent(before),
            }
          }
          await fs.promises.writeFile(filePath, data)
          return { applied: true as const }
        },
      })
      const before = valueOf(
        await inspect3dAsset({
          path: 'portfolio.blend',
          cwd: root,
          fs: fileSystem,
        }),
      )
      expect(before.summary.objects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'PortfolioCube' }),
        ]),
      )
      expect(before.derivedMetadataPath).toBe(
        `.openbuff/artifacts/3d/metadata/${before.sourceHash}.json`,
      )

      const preview = await render3dPreview({
        path: 'portfolio.blend',
        views: ['perspective'],
        mode: 'clay',
        width: 128,
        height: 128,
        cwd: root,
        fs: fileSystem,
      })
      if (!preview.some((part) => part.type === 'media')) {
        throw new Error(
          `Preview did not attach media: ${JSON.stringify(preview)}`,
        )
      }
      expect(preview[0]).toMatchObject({
        type: 'json',
        value: {
          receipts: [
            {
              sourcePath: 'portfolio.blend',
              sourceHash: before.sourceHash,
              dimensions: { width: 128, height: 128 },
              view: 'perspective',
              mode: 'clay',
            },
          ],
        },
      })

      const edit = await edit3dAsset({
        path: 'portfolio.blend',
        sourceHash: before.sourceHash,
        operations: [
          {
            type: 'rename_object',
            object: 'PortfolioCube',
            new_name: 'HeroModel',
          },
        ],
        cwd: root,
        fs: fileSystem,
        operationId: 'blender-e2e',
      })
      expect(edit[0]).toMatchObject({
        type: 'json',
        value: { outcome: 'applied' },
      })
      expect(edit.some((part) => part.type === 'media')).toBe(true)

      const after = valueOf(
        await inspect3dAsset({
          path: 'portfolio.blend',
          cwd: root,
          fs: fileSystem,
        }),
      )
      expect(after.sourceHash).not.toBe(before.sourceHash)
      expect(after.summary.objects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'HeroModel' }),
        ]),
      )
    },
    180_000,
  )
})
