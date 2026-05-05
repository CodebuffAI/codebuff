import { describe, expect, test } from 'bun:test'

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
})
