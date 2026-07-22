import { describe, expect, test } from 'bun:test'

import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import {
  encodeReadCapabilityToken,
  getContentHash,
} from '@codebuff/common/util/content-hash'

import { replaceRange } from '../tools/replace-range'

const capabilityIssuer = { projectId: '/repo', runId: 'replace-range-test' }

function capability(params: {
  path?: string
  startLine: number
  endLine: number
  content: string
  runId?: string
}): string {
  return encodeReadCapabilityToken({
    startLine: params.startLine,
    endLine: params.endLine,
    hash: getContentHash(params.content),
    scope: {
      projectId: '/repo',
      path: params.path ?? 'src/file.ts',
      runId: params.runId ?? capabilityIssuer.runId,
    },
  })
}

describe('replaceRange', () => {
  test('replaces a cap.v3-verified line range', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'line 1\nline 2\nline 3\n' },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 2,
          endLine: 2,
          content: 'line 2',
        }),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
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

  test('returns a fresh capability that authorizes an immediate follow-up edit', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'line 1\nline 2\nline 3\n' },
    })

    const first = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 2,
          endLine: 2,
          content: 'line 2',
        }),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })
    const firstValue = first[0]?.type === 'json' ? first[0].value : undefined
    if (
      !firstValue ||
      typeof firstValue !== 'object' ||
      !('freshCapabilities' in firstValue) ||
      !Array.isArray(firstValue.freshCapabilities)
    ) {
      throw new Error('expected a fresh post-edit capability')
    }
    const freshCapability = firstValue.freshCapabilities[0]
    if (
      !freshCapability ||
      typeof freshCapability !== 'object' ||
      !('token' in freshCapability) ||
      typeof freshCapability.token !== 'string'
    ) {
      throw new Error('expected a fresh post-edit capability token')
    }

    const second = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: freshCapability.token,
        startLine: 3,
        endLine: 3,
        newContent: 'updated line 3',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })

    expect(second[0]).toMatchObject({
      type: 'json',
      value: { kind: 'file_mutation_result', outcome: 'applied' },
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\nupdated line 2\nupdated line 3\n',
    )
  })

  test('uses a whole-file capability to authorize a contained target', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'line 1\nline 2\nline 3\n' },
    })

    await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 1,
          endLine: 3,
          content: 'line 1\nline 2\nline 3',
        }),
        startLine: 2,
        endLine: 2,
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })

    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\nupdated line 2\nline 3\n',
    )
  })

  test('rejects stale capability-covered content before editing', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'line 1\nline 2\nline 3\n' },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 2,
          endLine: 2,
          content: 'old line 2',
        }),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })

    expect(result[0]).toMatchObject({
      type: 'json',
      value: { errorMessage: expect.stringContaining('changed after') },
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\nline 2\nline 3\n',
    )
  })

  test('rejects a capability from another run', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'line 1\nline 2\n' },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 1,
          endLine: 1,
          content: 'line 1',
          runId: 'other-run',
        }),
        newContent: 'updated line 1',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })

    expect(result[0]).toMatchObject({
      type: 'json',
      value: {
        errorMessage: expect.stringContaining(
          'different project, path, or agent run',
        ),
      },
    })
  })

  test('rejects no-op range replacements', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'line 1\nline 2\n' },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 1,
          endLine: 1,
          content: 'line 1',
        }),
        newContent: 'line 1',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })

    expect(result[0]).toMatchObject({
      type: 'json',
      value: {
        errorMessage: expect.stringContaining('identical to the current range'),
      },
    })
  })

  test('supports direct whole-file cap-only replacement with a trailing newline', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'old content\n' },
    })

    const result = await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 1,
          endLine: 2,
          content: 'old content\n',
        }),
        startLine: 1,
        endLine: 2,
        newContent: 'new content\n',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })

    expect(result[0]).toMatchObject({
      type: 'json',
      value: { kind: 'file_mutation_result', outcome: 'applied' },
    })
    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'new content\n',
    )
  })

  test('preserves CRLF line endings', async () => {
    const fs = createMockFs({
      files: { '/repo/src/file.ts': 'line 1\r\nline 2\r\nline 3\r\n' },
    })

    await replaceRange({
      parameters: {
        path: 'src/file.ts',
        readCapability: capability({
          startLine: 2,
          endLine: 2,
          content: 'line 2',
        }),
        newContent: 'updated line 2',
      },
      cwd: '/repo',
      fs,
      capabilityIssuer,
    })

    expect(await fs.readFile('/repo/src/file.ts', 'utf-8')).toBe(
      'line 1\r\nupdated line 2\r\nline 3\r\n',
    )
  })
})
