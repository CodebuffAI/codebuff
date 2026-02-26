import { describe, expect, test } from 'bun:test'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'

import { applyPatchTool } from '../tools/apply-patch'

describe('applyPatchTool', () => {
  test('applies a standard update patch', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'const a = 1\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: '@@ -1,1 +1,1 @@\n-const a = 1\n+const a = 2\n',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }
    expect(result[0].value.applied[0]?.action).toBe('update')

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toContain('const a = 2')
  })

  test('applies update patch when hunks use bare @@ headers', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': ['line1', 'line2', 'line3', ''].join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: ['@@', ' line1', '-line2', '+line2 changed', ' line3', ''].join(
            '\n',
          ),
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toBe(['line1', 'line2 changed', 'line3', ''].join('\n'))
  })

  test('applies update patch when hunk header ranges are incorrect', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': ['line1', 'line2', 'line3', ''].join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: [
            '@@ -39,6 +39,39 @@',
            ' line1',
            '-line2',
            '+line2 changed',
            ' line3',
            '',
          ].join('\n'),
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toBe(['line1', 'line2 changed', 'line3', ''].join('\n'))
  })

  test('applies update patch when unified hunk header is malformed', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': ['line1', 'line2', 'line3', ''].join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: ['@@ -1 +1 @@', ' line1', '-line2', '+line2 changed', ' line3', ''].join(
            '\n',
          ),
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toBe(['line1', 'line2 changed', 'line3', ''].join('\n'))
  })

  test('applies update patch with codex-style @@ anchor headers', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': ['before', 'target', 'after', ''].join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: [
            '@@ target',
            '+inserted',
            ' after',
            '',
          ].join('\n'),
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toBe(['before', 'target', 'inserted', 'after', ''].join('\n'))
  })

  test('applies update patch when file has CRLF line endings', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'line1\r\nline2\r\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: '@@ -1,2 +1,2 @@\n-line1\n-line2\n+line1 changed\n+line2\n',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }
    expect(result[0].value.applied[0]?.action).toBe('update')

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toContain('line1 changed')
    expect(updated).toContain('\r\n')
  })

  test('applies update patch when diff is wrapped in fenced markdown with leading text', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'const a = 1\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: [
            'Please apply this patch:',
            '```diff',
            '@@ -1,1 +1,1 @@',
            '-const a = 1',
            '+const a = 2',
            '```',
          ].join('\n'),
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }
    expect(result[0].value.applied[0]?.action).toBe('update')

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toContain('const a = 2')
  })

  test('applies update patch when diff fence uses CRLF newlines', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'const a = 1\r\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff:
            'Patch below:\r\n```diff\r\n@@ -1,1 +1,1 @@\r\n-const a = 1\r\n+const a = 2\r\n```',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }
    expect(result[0].value.applied[0]?.action).toBe('update')

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toBe('const a = 2\r\n')
  })

  test('does not force CRLF when original file has mixed line endings', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'line1\r\nline2\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: '@@ -1,2 +1,2 @@\n-line1\n-line2\n+line1 changed\n+line2\n',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(false)
    if ('errorMessage' in result[0].value) {
      throw new Error(`Unexpected error: ${result[0].value.errorMessage}`)
    }
    expect(result[0].value.applied[0]?.action).toBe('update')

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toContain('line1 changed\nline2\n')
    expect(updated).not.toContain('line1 changed\r\nline2\r\n')
  })

  test('returns detailed errorMessage when patch cannot be applied', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'hello\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: '@@ -1,1 +1,1 @@\n-goodbye\n+hi\n',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(true)
    if (!('errorMessage' in result[0].value)) {
      throw new Error('Expected errorMessage in tool result')
    }

    const message = result[0].value.errorMessage
    expect(message).toContain('Failed to apply patch to src/file.ts')
    expect(message).toContain('Tried strategies:')
    expect(message).toContain('Please re-read the file')
  })

  test('create_file ignores unified diff headers', async () => {
    const fs = createMockFs()

    await applyPatchTool({
      parameters: {
        operation: {
          type: 'create_file',
          path: 'src/new.txt',
          diff: [
            '--- /dev/null',
            '+++ b/src/new.txt',
            '@@',
            '+hello',
            '+world',
            '',
          ].join('\n'),
        },
      },
      cwd: '/repo',
      fs,
    })

    const created = await fs.readFile('/repo/src/new.txt', 'utf-8')
    expect(created).toBe('hello\nworld')
  })

  test('create_file errors for non-plus content lines', async () => {
    const fs = createMockFs()

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'create_file',
          path: 'src/new.txt',
          diff: ['+hello', 'oops', '+world'].join('\n'),
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }

    expect('errorMessage' in result[0].value).toBe(true)
    if (!('errorMessage' in result[0].value)) {
      throw new Error('Expected errorMessage in tool result')
    }

    expect(result[0].value.errorMessage).toContain('Invalid Add File Line: oops')
  })
})
