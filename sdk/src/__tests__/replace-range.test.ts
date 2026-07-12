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
        kind: 'file_mutation_result',
        outcome: 'applied',
        actions: [
          expect.objectContaining({
            action: 'update',
            path: 'src/file.ts',
            outcome: 'applied',
          }),
        ],
      })
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

    const currentHash = getRangeContentHash('line 2')
    expect(result).toEqual([
      {
        type: 'json',
        value: {
          file: 'src/file.ts',
          errorMessage: expect.stringContaining('target range is stale'),
        },
      },
    ])
    expect(result[0].type).toBe('json')
    if (result[0].type === 'json') {
      expect(result[0].value).toHaveProperty('errorMessage')
      if (!('errorMessage' in result[0].value)) {
        throw new Error('Expected replace_range error result')
      }
      const errorMessage = result[0].value.errorMessage
      expect(errorMessage).not.toContain('Checked current lines: 2-2.')
      expect(errorMessage).toContain('Current file length: 3 lines.')
      expect(errorMessage).toContain(
        `Current hash for requested range: ${currentHash}.`,
      )
      expect(errorMessage).toContain('discard any old expectedHash/rangeHash')
      expect(errorMessage).toContain(
        're-read this path with a visible line span first',
      )
      expect(errorMessage).toContain(
        'Re-read with read_files ranges: [{ path: "src/file.ts", startLine: 2, endLine: 2 }]',
      )
      expect(errorMessage).toContain('use the new rangeHash as expectedHash')
      expect(errorMessage).toContain(
        'Retry replace_range only if the fresh read shows the selected range still contains the intended target.',
      )
      expect(errorMessage).toContain('If the fresh read shows the target moved')
      expect(errorMessage).toContain(
        'str_replace/rewrite_symbol with fresh context',
      )
    }
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\nline 2\nline 3\n',
    )
  })

  test('notes when a stale range check is truncated by current file length', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'line 1\nline 2\nline 3\n',
      },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        startLine: 2,
        endLine: 8,
        expectedHash: getRangeContentHash('old line 2'),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0].type).toBe('json')
    if (result[0].type === 'json') {
      expect(result[0].value).toHaveProperty('errorMessage')
      if (!('errorMessage' in result[0].value)) {
        throw new Error('Expected replace_range error result')
      }
      const errorMessage = result[0].value.errorMessage
      expect(errorMessage).toContain('Requested lines: 2-8.')
      expect(errorMessage).toContain(
        'Checked current lines: 2-3 because the requested endLine is beyond the current file length.',
      )
      expect(errorMessage).toContain(
        'Use endLine <= 3 when re-reading; do not include a trailing phantom line beyond the visible file length.',
      )
      expect(errorMessage).toContain(
        'Re-read with read_files ranges: [{ path: "src/file.ts", startLine: 2, endLine: 3 }]',
      )
      expect(errorMessage).toContain('Current file length: 3 lines.')
    }
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
          errorMessage: expect.stringContaining(
            'identical to the current range',
          ),
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
