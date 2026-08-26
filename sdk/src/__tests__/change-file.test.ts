import { describe, expect, test } from 'bun:test'

import type { Stats } from 'node:fs'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'

import { changeFile } from '../tools/change-file'

describe('changeFile', () => {
  test('returns a simple success message for string replacements', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'const value = 1\n',
      },
    })

    const result = await changeFile({
      parameters: {
        type: 'patch',
        path: 'src/file.ts',
        content: '@@ -1,1 +1,1 @@\n-const value = 1\n+const value = 2\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          message: 'String replace applied successfully.',
        },
      },
    ])
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 2\n',
    )
  })

  test('tolerates absolute paths inside the project for string replacements', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'const value = 1\n',
      },
    })

    const result = await changeFile({
      parameters: {
        type: 'patch',
        path: '/repo/src/file.ts',
        content: '@@ -1,1 +1,1 @@\n-const value = 1\n+const value = 2\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          message: 'String replace applied successfully.',
        },
      },
    ])
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 2\n',
    )
  })

  test('returns a simple success message for new file writes', async () => {
    const fs = createMockFs()

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: 'src/file.ts',
        content: 'const value = 1\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          message: 'Created file successfully.',
        },
      },
    ])
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 1\n',
    )
  })

  test('does not recreate an existing parent directory', async () => {
    const fs = createMockFs({
      directories: { '/repo/src': [] },
      mkdirImpl: async () => {
        throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
      },
    })

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: 'src/file.ts',
        content: 'const value = 1\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.value).toMatchObject({
      message: 'Created file successfully.',
    })
    expect(fs.mkdir).not.toHaveBeenCalled()
  })

  test('recovers when mkdir reports EEXIST before the parent becomes visible', async () => {
    let parentChecks = 0
    const fs = createMockFs({
      statImpl: async (path) => {
        if (path !== '/repo/src' || ++parentChecks < 3)
          throw new Error('not visible yet')
        return { isDirectory: () => true } as Stats
      },
      mkdirImpl: async () => {
        throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
      },
    })

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: 'src/file.ts',
        content: 'const value = 1\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.value).toMatchObject({
      message: 'Created file successfully.',
    })
    expect(fs.mkdir).toHaveBeenCalledTimes(1)
  })

  test('tolerates absolute paths inside the project for file writes', async () => {
    const fs = createMockFs()

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: '/repo/src/file.ts',
        content: 'const value = 1\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          message: 'Created file successfully.',
        },
      },
    ])
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 1\n',
    )
  })

  test('accepts paths whose file names start with two dots inside the project', async () => {
    const fs = createMockFs()

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: '/repo/..config',
        content: 'value = true\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: '..config',
          message: 'Created file successfully.',
        },
      },
    ])
    expect(await fs.readFile('/repo/..config', 'utf-8')).toBe('value = true\n')
  })

  test('returns a simple success message for overwritten file writes', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'const value = 1\n',
      },
    })

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: 'src/file.ts',
        content: 'const value = 2\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          message: 'Overwrote file successfully.',
        },
      },
    ])
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 2\n',
    )
  })

  test('writes absolute paths outside the project', async () => {
    const fs = createMockFs()

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: '/outside/file.ts',
        content: 'const value = 1\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: '/outside/file.ts',
          message: 'Created file successfully.',
        },
      },
    ])
    expect(await fs.readFile('/outside/file.ts', 'utf-8')).toBe(
      'const value = 1\n',
    )
  })
})
