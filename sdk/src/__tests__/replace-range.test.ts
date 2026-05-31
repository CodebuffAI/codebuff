import { describe, expect, test } from 'bun:test'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'

import { getRangeContentHash, replaceRange } from '../tools/replace-range'

describe('replaceRange', () => {
  test('replaces a hash-verified line range', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'line 1\nline 2\nline 3\n',
      },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        startLine: 2,
        endLine: 2,
        expectedHash: getRangeContentHash('line 2'),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0].type).toBe('json')
    if (result[0].type === 'json') {
      expect(result[0].value).toMatchObject({
        file: 'src/file.ts',
        message: 'Replaced lines 2-2 successfully.',
      })
      expect(result[0].value).toHaveProperty('patch')
    }
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\nupdated line 2\nline 3\n',
    )
  })

  test('rejects stale ranges before editing', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'line 1\nline 2\nline 3\n',
      },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        startLine: 2,
        endLine: 2,
        expectedHash: getRangeContentHash('old line 2'),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          errorMessage: expect.stringContaining('target range is stale'),
        },
      },
    ])
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\nline 2\nline 3\n',
    )
  })

  test('rejects no-op range replacements', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'line 1\nline 2\n',
      },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        startLine: 1,
        endLine: 1,
        expectedHash: getRangeContentHash('line 1'),
        newContent: 'line 1',
      },
      cwd: '/repo',
      fs,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          errorMessage: expect.stringContaining('identical to the current range'),
        },
      },
    ])
  })

  test('preserves CRLF line endings', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'line 1\r\nline 2\r\nline 3\r\n',
      },
    })

    await replaceRange({
      parameters: {
        path: 'src/file.ts',
        startLine: 2,
        endLine: 2,
        expectedHash: getRangeContentHash('line 2'),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
    })

    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\r\nupdated line 2\r\nline 3\r\n',
    )
  })
})
