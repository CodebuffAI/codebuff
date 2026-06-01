import { describe, expect, test } from 'bun:test'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'

import { changeFile, changeFiles } from '../tools/change-file'

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

  test('rejects absolute paths outside the project', async () => {
    const fs = createMockFs()

    await expect(
      changeFile({
        parameters: {
          type: 'file',
          path: '/outside/file.ts',
          content: 'const value = 1\n',
        },
        cwd: '/repo',
        fs,
      }),
    ).rejects.toThrow('file path is outside the project directory')
  })

  test('atomically applies multiple file changes', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/one.ts': 'const one = 1\n',
        '/repo/src/two.ts': 'const two = 1\n',
      },
    })

    const result = await changeFiles({
      parameters: [
        {
          type: 'patch',
          path: 'src/one.ts',
          content: '@@ -1,1 +1,1 @@\n-const one = 1\n+const one = 2\n',
        },
        {
          type: 'patch',
          path: 'src/two.ts',
          content: '@@ -1,1 +1,1 @@\n-const two = 1\n+const two = 2\n',
        },
      ],
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          message: 'Atomic edit_transaction applied 2 file change(s).',
          files: [
            {
              path: 'src/one.ts',
              patch: '@@ -1,1 +1,1 @@\n-const one = 1\n+const one = 2\n',
              messages: [],
            },
            {
              path: 'src/two.ts',
              patch: '@@ -1,1 +1,1 @@\n-const two = 1\n+const two = 2\n',
              messages: [],
            },
          ],
        },
      },
    ])
    expect(await fs.readFile('/repo/src/one.ts', 'utf-8')).toBe('const one = 2\n')
    expect(await fs.readFile('/repo/src/two.ts', 'utf-8')).toBe('const two = 2\n')
  })

  test('does not write any file when one atomic file change fails to prepare', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/one.ts': 'const one = 1\n',
        '/repo/src/two.ts': 'const two = 1\n',
      },
    })

    const result = await changeFiles({
      parameters: [
        {
          type: 'patch',
          path: 'src/one.ts',
          content: '@@ -1,1 +1,1 @@\n-const one = 1\n+const one = 2\n',
        },
        {
          type: 'patch',
          path: 'src/two.ts',
          content: '@@ -1,1 +1,1 @@\n-const missing = 1\n+const missing = 2\n',
        },
      ],
      cwd: '/repo',
      fs,
    })

    const output = result[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).toHaveProperty('errorMessage')
    }
    expect(await fs.readFile('/repo/src/one.ts', 'utf-8')).toBe('const one = 1\n')
    expect(await fs.readFile('/repo/src/two.ts', 'utf-8')).toBe('const two = 1\n')
  })

  test('rolls back files written before an atomic write failure', async () => {
    const files: Record<string, string> = {
      '/repo/src/one.ts': 'const one = 1\n',
      '/repo/src/two.ts': 'const two = 1\n',
    }
    const fs = createMockFs({
      files,
      writeFileImpl: async (path, content) => {
        if (path === '/repo/src/two.ts') {
          throw new Error('disk full')
        }
        files[path] = content
      },
    })

    const result = await changeFiles({
      parameters: [
        {
          type: 'patch',
          path: 'src/one.ts',
          content: '@@ -1,1 +1,1 @@\n-const one = 1\n+const one = 2\n',
        },
        {
          type: 'patch',
          path: 'src/two.ts',
          content: '@@ -1,1 +1,1 @@\n-const two = 1\n+const two = 2\n',
        },
      ],
      cwd: '/repo',
      fs,
    })

    const output = result[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).toHaveProperty('errorMessage')
      expect(String((output.value as { errorMessage?: string }).errorMessage)).toContain(
        'Rolled back',
      )
    }
    expect(files['/repo/src/one.ts']).toBe('const one = 1\n')
    expect(files['/repo/src/two.ts']).toBe('const two = 1\n')
  })
})
