import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import { createNodeError } from '@codebuff/common/testing/errors'
import { describe, expect, test } from 'bun:test'

import { readImages } from '../tools/read-image'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { PathLike } from 'node:fs'

function createMockFs(files: Record<string, Buffer>): CodebuffFileSystem {
  return {
    readFile: async (filePath: PathLike) => {
      const file = files[String(filePath)]
      if (file) return file
      throw createNodeError(
        `ENOENT: no such file or directory: ${filePath}`,
        'ENOENT',
      )
    },
    stat: async (filePath: PathLike) => {
      const file = files[String(filePath)]
      if (file) {
        return {
          size: file.length,
          isDirectory: () => false,
          isFile: () => true,
          atimeMs: Date.now(),
          mtimeMs: Date.now(),
        }
      }
      throw createNodeError(
        `ENOENT: no such file or directory: ${filePath}`,
        'ENOENT',
      )
    },
    readdir: async () => [],
    mkdir: async () => undefined,
    realpath: async (filePath: PathLike) => String(filePath),
    unlink: async () => undefined,
    writeFile: async () => undefined,
  } as unknown as CodebuffFileSystem
}

describe('readImages', () => {
  test('returns metadata and media for supported images', async () => {
    const image = Buffer.from('fake-png-bytes')
    const output = await readImages({
      paths: ['screens/current.png'],
      cwd: '/project',
      fs: createMockFs({
        '/project/screens/current.png': image,
      }),
    })

    expect(output[0]).toEqual({
      type: 'json',
      value: {
        images: [
          {
            path: 'screens/current.png',
            status: 'attached',
            mediaType: 'image/png',
            sizeBytes: image.length,
            message: 'Image attached as original media.',
          },
        ],
      },
    })
    expect(output[1]).toEqual({
      type: 'media',
      data: image.toString('base64'),
      mediaType: 'image/png',
    })
  })

  test('applies the host file filter before attaching media', async () => {
    const output = await readImages({
      paths: ['screens/private.png'],
      cwd: '/project',
      fs: createMockFs({
        '/project/screens/private.png': Buffer.from('private-image'),
      }),
      fileFilter: () => ({ status: 'blocked' }),
    })

    expect(output).toHaveLength(1)
    expect(output[0]).toMatchObject({
      type: 'json',
      value: {
        images: [
          {
            path: 'screens/private.png',
            status: 'error',
            message: FILE_READ_STATUS.IGNORED,
          },
        ],
      },
    })
  })

  test('preserves large screenshots as original media when under file limit', async () => {
    const image = Buffer.alloc(2_291_770, 1)
    const output = await readImages({
      paths: ['screens/current.png'],
      cwd: '/project',
      fs: createMockFs({
        '/project/screens/current.png': image,
      }),
    })

    expect(output[0].type).toBe('json')
    if (output[0].type !== 'json') throw new Error('Expected JSON output')
    expect(output[0].value.images[0]).toEqual({
      path: 'screens/current.png',
      status: 'attached',
      mediaType: 'image/png',
      sizeBytes: image.length,
      message: 'Image attached as original media.',
    })

    const media = output[1]
    expect(media.type).toBe('media')
    if (media.type !== 'media') throw new Error('Expected media output')
    expect(media.mediaType).toBe('image/png')
    expect(media.data).toBe(image.toString('base64'))
  })

  test('rejects in-project symlinks pointing outside the project root', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readimg-root-'))
    const tmpOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'readimg-out-'))
    try {
      const projectRoot = fs.realpathSync(tmpRoot)
      const outsideDir = fs.realpathSync(tmpOutside)
      const secret = path.join(outsideDir, 'secret.png')
      fs.writeFileSync(secret, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const linkPath = path.join(projectRoot, 'leak.png')
      fs.symlinkSync(secret, linkPath)

      const output = await readImages({
        paths: ['leak.png'],
        cwd: projectRoot,
        fs: fs.promises,
      })

      expect(output).toHaveLength(1)
      expect(output[0].type).toBe('json')
      if (output[0].type !== 'json') throw new Error('Expected JSON output')
      const entry = output[0].value.images[0]
      expect(entry.status).toBe('error')
      expect(entry.message).toMatch(/outside the project|OUTSIDE_PROJECT/i)
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
      fs.rmSync(tmpOutside, { recursive: true, force: true })
    }
  })

  test('reports unsupported formats without media output', async () => {
    const output = await readImages({
      paths: ['screens/current.txt'],
      cwd: '/project',
      fs: createMockFs({
        '/project/screens/current.txt': Buffer.from('not an image'),
      }),
    })

    expect(output).toHaveLength(1)
    expect(output[0].type).toBe('json')
    if (output[0].type !== 'json') throw new Error('Expected JSON output')
    expect(output[0].value.images[0]).toMatchObject({
      path: 'screens/current.txt',
      status: 'error',
    })
  })
})
