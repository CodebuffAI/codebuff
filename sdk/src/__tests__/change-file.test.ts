import { describe, expect, test } from 'bun:test'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { getContentHash } from '@codebuff/common/util/content-hash'

import { changeFile, changeFiles } from '../tools/change-file'
import { MAX_FILE_CHANGES_PER_TRANSACTION } from '@codebuff/common/actions'

describe('changeFile', () => {
  test('returns a canonical authority-backed result for string replacements', async () => {
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

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      version: 1,
      outcome: 'applied',
      actions: [
        expect.objectContaining({
          action: 'update',
          path: 'src/file.ts',
          outcome: 'applied',
        }),
      ],
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 2\n',
    )
  })

  test('rejects absolute prompt paths even when they point inside the project', async () => {
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

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'blocked' })],
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 1\n',
    )
  })

  test('returns a canonical authority-backed result for new file writes', async () => {
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

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      actions: [expect.objectContaining({ action: 'create' })],
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 1\n',
    )
  })

  test('rejects absolute file-write prompt paths inside the project', async () => {
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

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
    })
    await expect(fs.readFile('/repo/src/file.ts', 'utf-8')).rejects.toThrow()
  })

  test('accepts paths whose file names start with two dots inside the project', async () => {
    const fs = createMockFs()

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: '..config',
        content: 'value = true\n',
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      actions: [expect.objectContaining({ path: '..config' })],
    })
    expect(await fs.readFile('/repo/..config', 'utf-8')).toBe('value = true\n')
  })

  test('returns a canonical result for overwritten file writes', async () => {
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

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      actions: [expect.objectContaining({ action: 'update' })],
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'const value = 2\n',
    )
  })

  test('uses conditionalCommit for updates when the adapter provides it', async () => {
    const fs = createMockFs({ files: { '/repo/src/file.ts': 'before\n' } })
    let conditionalCalls = 0
    fs.conditionalCommit = async () => {
      conditionalCalls += 1
      return { applied: false, actualHash: getContentHash('external\n') }
    }

    const result = await changeFile({
      parameters: { type: 'file', path: 'src/file.ts', content: 'after\n' },
      cwd: '/repo',
      fs,
    })

    expect(conditionalCalls).toBe(1)
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'stale_state' })],
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe('before\n')
  })

  test('fails closed for a guarded update when conditional commit is unavailable', async () => {
    const fs = createMockFs({ files: { '/repo/src/file.ts': 'before\n' } })
    fs.conditionalCommit = undefined

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: 'src/file.ts',
        content: 'after\n',
        expectedHash: getContentHash('before\n'),
      },
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'unsupported' })],
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe('before\n')
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

  test('applies multiple preflighted file changes with a verified receipt', async () => {
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

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      actions: [
        expect.objectContaining({ path: 'src/one.ts', outcome: 'applied' }),
        expect.objectContaining({ path: 'src/two.ts', outcome: 'applied' }),
      ],
    })
    expect(await fs.readFile('/repo/src/one.ts', 'utf-8')).toBe(
      'const one = 2\n',
    )
    expect(await fs.readFile('/repo/src/two.ts', 'utf-8')).toBe(
      'const two = 2\n',
    )
  })

  test('does not write any file when one coordinated change fails to prepare', async () => {
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
      expect(output.value).toMatchObject({
        kind: 'file_mutation_result',
        outcome: 'not_applied',
      })
    }
    expect(await fs.readFile('/repo/src/one.ts', 'utf-8')).toBe(
      'const one = 1\n',
    )
    expect(await fs.readFile('/repo/src/two.ts', 'utf-8')).toBe(
      'const two = 1\n',
    )
  })

  test('rolls back files written before a coordinated write failure', async () => {
    const files: Record<string, string> = {
      '/repo/src/one.ts': 'const one = 1\n',
      '/repo/src/two.ts': 'const two = 1\n',
    }
    let failedWrite = false
    const fs = createMockFs({
      files,
      readFileImpl: async (path) => {
        const content = files[path]
        if (content === undefined)
          throw Object.assign(new Error('not found'), { code: 'ENOENT' })
        return content
      },
      writeFileImpl: async (path, content) => {
        if (path === '/repo/src/two.ts' && !failedWrite) {
          failedWrite = true
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
      expect(output.value).toMatchObject({
        kind: 'file_mutation_result',
        outcome: 'rolled_back',
      })
    }
    expect(files['/repo/src/one.ts']).toBe('const one = 1\n')
    expect(files['/repo/src/two.ts']).toBe('const two = 1\n')
  })

  test('reports an incomplete rollback without claiming atomic restoration', async () => {
    const files: Record<string, string> = {
      '/repo/src/one.ts': 'const one = 1\n',
      '/repo/src/two.ts': 'const two = 1\n',
    }
    const fs = createMockFs({
      files,
      readFileImpl: async (path) => {
        const content = files[path]
        if (content === undefined)
          throw Object.assign(new Error('not found'), { code: 'ENOENT' })
        return content
      },
      writeFileImpl: async (path, content) => {
        if (path === '/repo/src/two.ts') throw new Error('disk full')
        if (path === '/repo/src/one.ts' && content === 'const one = 1\n') {
          throw new Error('rollback denied')
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

    const value = result[0]?.type === 'json' ? result[0].value : undefined
    expect(value).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'rollback_incomplete',
      actions: expect.arrayContaining([
        expect.objectContaining({
          path: 'src/one.ts',
          outcome: 'applied',
          rollback: expect.objectContaining({
            attempted: true,
            succeeded: false,
          }),
        }),
      ]),
      authorityReceipt: expect.objectContaining({
        status: 'rollback_incomplete',
      }),
    })
    expect(files['/repo/src/one.ts']).toBe('const one = 2\n')
  })

  test('does not overwrite an external edit when conditional rollback detects a conflict', async () => {
    const fs = createMockFs({
      files: {
        '/repo/src/one.ts': 'one-before\n',
        '/repo/src/two.ts': 'two-before\n',
      },
    })
    const conditionalCommit = fs.conditionalCommit!.bind(fs)
    fs.conditionalCommit = async (filePath, data, options) => {
      if (String(filePath) === '/repo/src/two.ts') {
        await fs.writeFile('/repo/src/one.ts', 'external\n')
        throw new Error('disk full')
      }
      return conditionalCommit(filePath, data, options)
    }

    const result = await changeFiles({
      parameters: [
        {
          type: 'file',
          path: 'src/one.ts',
          content: 'one-after\n',
          expectedHash: getContentHash('one-before\n'),
        },
        {
          type: 'file',
          path: 'src/two.ts',
          content: 'two-after\n',
          expectedHash: getContentHash('two-before\n'),
        },
      ],
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      outcome: 'rollback_incomplete',
      actions: [
        expect.objectContaining({
          path: 'src/one.ts',
          rollback: expect.objectContaining({ succeeded: false }),
          error: expect.objectContaining({ code: 'rollback_incomplete' }),
        }),
        expect.anything(),
      ],
    })
    expect(await fs.readFile('/repo/src/one.ts', 'utf-8')).toBe('external\n')
  })

  test('[ABI-M08] coordinates create, delete, and move with expected state', async () => {
    const fs = createMockFs({
      files: {
        '/repo/delete.txt': 'remove me',
        '/repo/source.txt': 'move me',
      },
    })

    const result = await changeFiles({
      parameters: [
        {
          type: 'file',
          path: 'created.txt',
          content: 'created',
          expectedHash: null,
        },
        {
          type: 'delete',
          path: 'delete.txt',
          expectedHash: getContentHash('remove me'),
        },
        {
          type: 'move',
          path: 'source.txt',
          destinationPath: 'moved.txt',
          expectedHash: getContentHash('move me'),
          destinationExpectedHash: null,
        },
      ],
      cwd: '/repo',
      fs,
    })

    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      actions: [
        expect.objectContaining({ action: 'create', path: 'created.txt' }),
        expect.objectContaining({ action: 'delete', path: 'delete.txt' }),
        expect.objectContaining({
          action: 'move',
          path: 'source.txt',
          destinationPath: 'moved.txt',
        }),
      ],
    })
    expect(await fs.readFile('/repo/created.txt', 'utf-8')).toBe('created')
    await expect(fs.readFile('/repo/delete.txt', 'utf-8')).rejects.toThrow()
    await expect(fs.readFile('/repo/source.txt', 'utf-8')).rejects.toThrow()
    expect(await fs.readFile('/repo/moved.txt', 'utf-8')).toBe('move me')
  })

  test('[ABI-M08] rejects a stale lifecycle transaction before commit', async () => {
    const fs = createMockFs({ files: { '/repo/delete.txt': 'current' } })
    const result = await changeFiles({
      parameters: [
        {
          type: 'delete',
          path: 'delete.txt',
          expectedHash: getContentHash('stale'),
        },
      ],
      cwd: '/repo',
      fs,
    })
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'stale_state' })],
    })
    expect(await fs.readFile('/repo/delete.txt', 'utf-8')).toBe('current')
  })

  test('[ABI-M08] revalidates state after commit authorization', async () => {
    let targetReads = 0
    const fs = createMockFs({
      files: { '/repo/file.txt': 'before' },
      readFileImpl: async (path) => {
        if (path !== '/repo/file.txt') throw new Error('not found')
        targetReads++
        return targetReads === 1 ? 'before' : 'external-change'
      },
    })
    const result = await changeFiles({
      parameters: [
        {
          type: 'file',
          path: 'file.txt',
          content: 'after',
          expectedHash: getContentHash('before'),
        },
      ],
      cwd: '/repo',
      fs,
    })
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'stale_state' })],
    })
    expect(targetReads).toBeGreaterThanOrEqual(2)
  })

  test('mandatory mutation policy blocks sensitive and custom-filtered paths', async () => {
    const fs = createMockFs()
    const sensitive = await changeFile({
      parameters: { type: 'file', path: '.env', content: 'SECRET=value' },
      cwd: '/repo',
      fs,
    })
    expect(
      sensitive[0]?.type === 'json' ? sensitive[0].value : null,
    ).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'blocked' })],
    })
    const customBlocked = await changeFile({
      parameters: { type: 'file', path: 'blocked.txt', content: 'nope' },
      cwd: '/repo',
      fs,
      fileFilter: (path) => ({
        status: path === 'blocked.txt' ? 'blocked' : 'allow',
      }),
    })
    expect(
      customBlocked[0]?.type === 'json' ? customBlocked[0].value : null,
    ).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'blocked' })],
    })
    await expect(fs.readFile('/repo/.env', 'utf-8')).rejects.toThrow()
    await expect(fs.readFile('/repo/blocked.txt', 'utf-8')).rejects.toThrow()
  })

  test('successful transactions include an authority-owned verified receipt', async () => {
    const fs = createMockFs({ files: { '/repo/file.txt': 'before' } })
    const result = await changeFiles({
      parameters: [
        {
          type: 'file',
          path: 'file.txt',
          content: 'after',
          expectedHash: getContentHash('before'),
        },
      ],
      cwd: '/repo',
      fs,
      callId: 'tool-call',
    })
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'applied',
      authorityReceipt: {
        kind: 'commit_receipt',
        callId: 'tool-call',
        status: 'committed',
        finalHashes: { 'file.txt': getContentHash('after') },
      },
    })
  })

  test('[ABI-M08] fails closed when conditional no-clobber move is unavailable', async () => {
    const fs = createMockFs({ files: { '/repo/source.txt': 'move me' } })
    fs.conditionalMove = undefined
    const result = await changeFiles({
      parameters: [
        {
          type: 'move',
          path: 'source.txt',
          destinationPath: 'moved.txt',
          expectedHash: getContentHash('move me'),
          destinationExpectedHash: null,
        },
      ],
      cwd: '/repo',
      fs,
    })
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'unsupported' })],
    })
    expect(await fs.readFile('/repo/source.txt', 'utf-8')).toBe('move me')
    await expect(fs.readFile('/repo/moved.txt', 'utf-8')).rejects.toThrow()
  })

  test('returns a structured resource-limit result for oversized transactions', async () => {
    const fs = createMockFs()
    const result = await changeFiles({
      parameters: Array.from(
        { length: MAX_FILE_CHANGES_PER_TRANSACTION + 1 },
        (_, index) => ({
          type: 'file' as const,
          path: `file-${index}.txt`,
          content: 'x',
          expectedHash: null,
        }),
      ),
      cwd: '/repo',
      fs,
    })
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      kind: 'file_mutation_result',
      outcome: 'not_applied',
      errors: [
        expect.objectContaining({
          code: 'resource_limit',
          recovery: 'split_transaction',
        }),
      ],
    })
  })
})
