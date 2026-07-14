import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'

import { applyPatchTool, getPatchRangeContentHash } from '../tools/apply-patch'

function expectAppliedAction(
  value: unknown,
  action: 'add' | 'update' | 'delete',
): void {
  const canonicalAction = action === 'add' ? 'create' : action
  if (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'file_mutation_result' &&
    'actions' in value &&
    Array.isArray(value.actions)
  ) {
    expect(value).toMatchObject({ outcome: 'applied' })
    expect(value.actions[0]?.action).toBe(canonicalAction)
    return
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('applied' in value) ||
    !Array.isArray(value.applied)
  ) {
    throw new Error('Expected canonical apply_patch success result')
  }
  expect(value.applied[0]?.action).toBe(action)
}

function getMutationErrorMessage(result: unknown): string {
  const value = (result as any)?.[0]?.value
  if (
    value?.kind !== 'file_mutation_result' ||
    !Array.isArray(value.errors) ||
    typeof value.errors[0]?.message !== 'string'
  ) {
    throw new Error('Expected canonical mutation error result')
  }
  return value.errors[0].message
}

describe('applyPatchTool', () => {
  test('[MUT-H02] create_file uses exclusive create and rejects a collision', async () => {
    const fs = createMockFs({
      files: { '/repo/src/new.txt': 'existing\n' },
    })
    fs.createFileExclusive = async () => {
      throw Object.assign(new Error('File exists'), { code: 'EEXIST' })
    }

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'create_file',
          path: 'src/new.txt',
          diff: '+replacement\n',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(getMutationErrorMessage(result)).toContain('File exists')
    expect(result[0]?.value).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      authorityReceipt: {
        kind: 'commit_receipt',
        status: 'not_started',
      },
    })
    expect(await fs.readFile('/repo/src/new.txt', 'utf-8')).toBe('existing\n')
  })

  test('[MUT-H02] update_file rejects stale expected state before commit', async () => {
    let reads = 0
    let writeCalled = false
    const fs = createMockFs({
      readFileImpl: async () => {
        reads += 1
        return reads === 1 ? 'const value = 1\n' : 'const external = true\n'
      },
      writeFileImpl: async () => {
        writeCalled = true
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: '@@ -1,1 +1,1 @@\n-const value = 1\n+const value = 2\n',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(getMutationErrorMessage(result)).toContain(
      'changed after it was read',
    )
    expect(writeCalled).toBe(false)
  })

  test('[MUT-H02] delete_file rejects stale expected state before unlink', async () => {
    let reads = 0
    let unlinkCalled = false
    const fs = createMockFs({
      readFileImpl: async () => {
        reads += 1
        return reads === 1 ? 'original\n' : 'external change\n'
      },
      unlinkImpl: async () => {
        unlinkCalled = true
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: { type: 'delete_file', path: 'src/file.ts' },
      },
      cwd: '/repo',
      fs,
    })

    expect(getMutationErrorMessage(result)).toContain(
      'changed after it was read',
    )
    expect(unlinkCalled).toBe(false)
  })

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
    expectAppliedAction(result[0].value, 'update')

    const updated = await fs.readFile('/repo/src/file.ts', 'utf-8')
    expect(updated).toContain('const a = 2')
  })

  test('allows an update patch to delete all file content', async () => {
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
          diff: '@@ -1,1 +0,0 @@\n-const a = 1\n',
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
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe('')
  })

  test('uses unified old-line coordinates to target repeated context', async () => {
    const original = [
      'start',
      'const value = 1',
      'end',
      'separator',
      'start',
      'const value = 1',
      'end',
      '',
    ].join('\n')
    const fs = createMockFs({
      files: { '/repo/src/file.ts': original },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: [
            '@@ -5,3 +5,3 @@',
            ' start',
            '-const value = 1',
            '+const value = 2',
            ' end',
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
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      [
        'start',
        'const value = 1',
        'end',
        'separator',
        'start',
        'const value = 2',
        'end',
        '',
      ].join('\n'),
    )
  })

  test('rejects ambiguous coordinate-less patches without editing', async () => {
    const original = [
      'start',
      'const value = 1',
      'end',
      'separator',
      'start',
      'const value = 1',
      'end',
      '',
    ].join('\n')
    const fs = createMockFs({
      files: { '/repo/src/file.ts': original },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: [
            '@@',
            ' start',
            '-const value = 1',
            '+const value = 2',
            ' end',
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
    expect(getMutationErrorMessage(result)).toContain('Ambiguous Context')
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(original)
  })

  test('uses the unified coordinate for zero-context insertions', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'a\nb\nc\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: '@@ -2,0 +3,1 @@\n+inserted\n',
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
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'a\nb\ninserted\nc\n',
    )
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
          diff: [
            '@@ -1 +1 @@',
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
          diff: ['@@ target', '+inserted', ' after', ''].join('\n'),
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
    expect(updated).toBe(
      ['before', 'target', 'inserted', 'after', ''].join('\n'),
    )
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
    expectAppliedAction(result[0].value, 'update')

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
    expectAppliedAction(result[0].value, 'update')

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
          diff: 'Patch below:\r\n```diff\r\n@@ -1,1 +1,1 @@\r\n-const a = 1\r\n+const a = 2\r\n```',
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
    expectAppliedAction(result[0].value, 'update')

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
    expectAppliedAction(result[0].value, 'update')

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

    const message = getMutationErrorMessage(result)
    expect(message).toContain('Failed to apply patch to src/file.ts')
    expect(message).toContain('Tried strategies:')
    expect(message).toContain('Please re-read the file')
  })

  test('blocks naked apply_patch on large files', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    )
    const fs = createMockFs({
      files: {
        '/repo/src/large.ts': lines.join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/large.ts',
          diff: '@@\n-const target = 1;\n+const target = 2;\n',
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }
    expect(getMutationErrorMessage(result)).toContain(
      'Large-file apply_patch blocked',
    )
    expect(await fs.readFile('/repo/src/large.ts', 'utf-8')).toBe(
      lines.join('\n'),
    )
  })

  test('applies multi-hunk large-file patch with valid basedOnRead ranges', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 100
        ? 'const first = 1;'
        : index === 900
          ? 'const second = 1;'
          : `const filler${index} = ${index};`,
    )
    const fs = createMockFs({
      files: {
        '/repo/src/large.ts': lines.join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/large.ts',
          diff: [
            '@@',
            ' const filler99 = 99;',
            '-const first = 1;',
            '+const first = 2;',
            ' const filler101 = 101;',
            '@@',
            ' const filler899 = 899;',
            '-const second = 1;',
            '+const second = 2;',
            ' const filler901 = 901;',
            '',
          ].join('\n'),
          basedOnRead: [
            {
              startLine: 100,
              endLine: 102,
              hash: getPatchRangeContentHash(lines.slice(99, 102).join('\n')),
            },
            {
              startLine: 900,
              endLine: 902,
              hash: getPatchRangeContentHash(lines.slice(899, 902).join('\n')),
            },
          ],
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

    const updated = await fs.readFile('/repo/src/large.ts', 'utf-8')
    expect(updated).toContain('const first = 2;')
    expect(updated).toContain('const second = 2;')
  })

  test('rejects stale apply_patch basedOnRead ranges before editing', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 1;' : `const filler${index} = ${index};`,
    )
    const fs = createMockFs({
      files: {
        '/repo/src/large.ts': lines.join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/large.ts',
          diff: '@@\n-const target = 1;\n+const target = 2;\n',
          basedOnRead: [
            {
              startLine: 501,
              endLine: 501,
              hash: getPatchRangeContentHash('const target = 0;'),
            },
          ],
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }
    expect(getMutationErrorMessage(result)).toContain(
      'the basedOnRead range is stale',
    )
    expect(await fs.readFile('/repo/src/large.ts', 'utf-8')).toBe(
      lines.join('\n'),
    )
  })

  test('rejects large-file patch hunks outside provided basedOnRead ranges', async () => {
    const lines = Array.from({ length: 1_001 }, (_, index) =>
      index === 100
        ? 'const first = 1;'
        : index === 900
          ? 'const second = 1;'
          : `const filler${index} = ${index};`,
    )
    const fs = createMockFs({
      files: {
        '/repo/src/large.ts': lines.join('\n'),
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/large.ts',
          diff: [
            '@@',
            ' const filler99 = 99;',
            '-const first = 1;',
            '+const first = 2;',
            ' const filler101 = 101;',
            '@@',
            ' const filler899 = 899;',
            '-const second = 1;',
            '+const second = 2;',
            ' const filler901 = 901;',
            '',
          ].join('\n'),
          basedOnRead: [
            {
              startLine: 100,
              endLine: 102,
              hash: getPatchRangeContentHash(lines.slice(99, 102).join('\n')),
            },
          ],
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }
    expect(getMutationErrorMessage(result)).toContain(
      'outside the provided basedOnRead ranges',
    )
    expect(await fs.readFile('/repo/src/large.ts', 'utf-8')).toBe(
      lines.join('\n'),
    )
  })

  test('returns structured error for malformed basedOnRead entries', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/file.ts': 'const target = 1;\n',
      },
    })

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'src/file.ts',
          diff: '@@\n-const target = 1;\n+const target = 2;\n',
          basedOnRead: [
            {
              startLine: 'not-a-number',
              endLine: 1,
              hash: getPatchRangeContentHash('const target = 1;'),
            },
          ],
        },
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type).toBe('json')
    if (result[0]?.type !== 'json') {
      throw new Error('Expected JSON tool result')
    }
    expect(getMutationErrorMessage(result)).toContain(
      'Invalid apply_patch input',
    )
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const target = 1;\n',
    )
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

    expect(getMutationErrorMessage(result)).toContain(
      'Invalid Add File Line: oops',
    )
  })
})

describe('applyPatchTool symlink containment', () => {
  let projectRoot: string
  let outsideRoot: string

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-root-'))
    outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-patch-outside-'))
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  })

  test('updates through an in-project symlink without replacing the link', async () => {
    const target = path.join(projectRoot, 'target.txt')
    const link = path.join(projectRoot, 'link.txt')
    fs.writeFileSync(target, 'before\n')
    fs.symlinkSync(target, link)

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'link.txt',
          diff: '@@ -1,1 +1,1 @@\n-before\n+after\n',
        },
      },
      cwd: projectRoot,
      fs: fs.promises,
    })

    expect(result[0]?.value).not.toHaveProperty('errorMessage')
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toBe('after\n')
  })

  test('blocks a safe lexical symlink whose canonical target is sensitive', async () => {
    const target = path.join(projectRoot, '.env')
    const link = path.join(projectRoot, 'safe-link.txt')
    fs.writeFileSync(target, 'SECRET=before\n')
    fs.symlinkSync(target, link)

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'safe-link.txt',
          diff: '@@ -1,1 +1,1 @@\n-SECRET=before\n+SECRET=after\n',
        },
      },
      cwd: projectRoot,
      fs: fs.promises,
    })

    expect(getMutationErrorMessage(result)).toContain('Invalid path')
    expect(fs.readFileSync(target, 'utf8')).toBe('SECRET=before\n')
  })

  test('rejects an in-project symlink whose target is outside', async () => {
    const outsideTarget = path.join(outsideRoot, 'secret.txt')
    fs.writeFileSync(outsideTarget, 'secret\n')
    fs.symlinkSync(outsideTarget, path.join(projectRoot, 'escape.txt'))

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'update_file',
          path: 'escape.txt',
          diff: '@@ -1,1 +1,1 @@\n-secret\n+changed\n',
        },
      },
      cwd: projectRoot,
      fs: fs.promises,
    })

    expect(getMutationErrorMessage(result)).toContain('Invalid path')
    expect(fs.readFileSync(outsideTarget, 'utf8')).toBe('secret\n')
  })

  test('deletes an allowed in-project symlink instead of its target', async () => {
    const target = path.join(projectRoot, 'target.txt')
    const link = path.join(projectRoot, 'link.txt')
    fs.writeFileSync(target, 'keep\n')
    fs.symlinkSync(target, link)

    const result = await applyPatchTool({
      parameters: {
        operation: { type: 'delete_file', path: 'link.txt' },
      },
      cwd: projectRoot,
      fs: fs.promises,
    })

    expect(result[0]?.value).not.toHaveProperty('errorMessage')
    expect(fs.existsSync(link)).toBe(false)
    expect(fs.readFileSync(target, 'utf8')).toBe('keep\n')
  })

  test('creates missing files through an in-project directory symlink', async () => {
    const realDirectory = path.join(projectRoot, 'real')
    fs.mkdirSync(realDirectory)
    fs.symlinkSync(realDirectory, path.join(projectRoot, 'link'))

    const result = await applyPatchTool({
      parameters: {
        operation: {
          type: 'create_file',
          path: 'link/nested/new.txt',
          diff: '+created\n',
        },
      },
      cwd: projectRoot,
      fs: fs.promises,
    })

    expect(result[0]?.value).not.toHaveProperty('errorMessage')
    expect(
      fs.readFileSync(path.join(realDirectory, 'nested', 'new.txt'), 'utf8'),
    ).toBe('created')
  })
})
