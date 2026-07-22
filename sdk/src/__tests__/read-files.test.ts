import * as projectFileTree from '@codebuff/common/project-file-tree'
import { createNodeError } from '@codebuff/common/testing/errors'
import {
  decodeReadCapabilityToken,
  getContentHash,
  readCapabilityMatchesScope,
} from '@codebuff/common/util/content-hash'
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import {
  MAX_RANGE_READ_BYTES,
  READ_SNAPSHOT_CONCURRENCY,
  getFileForEditResult,
  getFilesStructured,
  getFilesStructuredFromOverride,
} from '../tools/read-files'
import { editTransactionParams } from '@codebuff/common/tools/params/tool/edit-transaction'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { PathLike } from 'node:fs'

function createMockFs(config: {
  files?: Record<string, { content: string | Uint8Array; size?: number }>
  errors?: Record<string, { code?: string; message?: string }>
  capabilities?: Partial<CodebuffFileSystem>
}): CodebuffFileSystem {
  const { files = {}, errors = {}, capabilities = {} } = config

  return {
    readFile: async (filePath: PathLike) => {
      const pathStr = String(filePath)
      if (errors[pathStr]) {
        throw createNodeError(
          errors[pathStr].message || 'Unknown error',
          errors[pathStr].code || 'UNKNOWN',
        )
      }
      if (files[pathStr]) return files[pathStr].content
      throw createNodeError(
        `ENOENT: no such file or directory: ${pathStr}`,
        'ENOENT',
      )
    },
    stat: async (filePath: PathLike) => {
      const pathStr = String(filePath)
      if (errors[pathStr]) {
        throw createNodeError(
          errors[pathStr].message || 'Unknown error',
          errors[pathStr].code || 'UNKNOWN',
        )
      }
      if (files[pathStr]) {
        return {
          size: files[pathStr].size ?? files[pathStr].content.length,
          isDirectory: () => false,
          isFile: () => true,
          atimeMs: Date.now(),
          mtimeMs: Date.now(),
        }
      }
      throw createNodeError(
        `ENOENT: no such file or directory: ${pathStr}`,
        'ENOENT',
      )
    },
    readdir: async () => [],
    mkdir: async () => undefined,
    realpath: async (filePath: PathLike) => String(filePath),
    writeFile: async () => undefined,
    ...capabilities,
  } as unknown as CodebuffFileSystem
}

describe('getFilesStructured', () => {
  let isFileIgnoredSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    isFileIgnoredSpy = spyOn(
      projectFileTree,
      'isFileIgnored',
    ).mockResolvedValue(false)
  })

  afterEach(() => {
    mock.restore()
  })

  describe('structured v1 results', () => {
    test('returns explicit per-selector success and failure items', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'line 1\nline 2\nline 3\n' },
        },
      })

      const result = await getFilesStructured({
        filePaths: ['src/index.ts', 'src/missing.ts'],
        capabilityIssuer: { projectId: '/project', runId: 'run-structured-1' },
        ranges: [
          { path: 'src/index.ts', startLine: 1, endLine: 1 },
          { path: 'src/index.ts', startLine: 3, endLine: 3 },
        ],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result.kind).toBe('read_files_result')
      expect(result.version).toBe(1)
      expect(result.status).toBe('partial')
      expect(result.summary).toEqual({
        requested: 4,
        ok: 3,
        partial: 0,
        failed: 1,
        uniquePaths: 2,
      })
      expect(result.results.map((item) => item.requestIndex)).toEqual([
        0, 1, 2, 3,
      ])
      expect(result.results[1]).toMatchObject({
        selector: 'file',
        path: 'src/missing.ts',
        status: 'error',
        error: { code: 'not_found' },
      })
      expect(result.results[2]).toMatchObject({
        selector: 'range',
        status: 'ok',
        startLine: 1,
        endLine: 1,
        sourceContent: 'line 1',
        editAnchor: {
          startLine: 1,
          endLine: 1,
          contentHash: getContentHash('line 1'),
          readCapability: expect.stringMatching(/^cap\./),
        },
      })
      expect(result.results[3]).toMatchObject({
        selector: 'range',
        status: 'ok',
        startLine: 3,
        endLine: 3,
        sourceContent: 'line 3',
      })
    })

    test('keeps template state out of content markers and reads large files fully', async () => {
      const largeContent = 'x'.repeat(100_001)
      const mockFs = createMockFs({
        files: {
          '/project/.env.example': { content: 'A=example' },
          '/project/src/large.ts': { content: largeContent },
        },
      })

      const capabilityIssuer = {
        projectId: '/project',
        runId: 'run-structured-2',
      }
      const result = await getFilesStructured({
        filePaths: ['.env.example', 'src/large.ts'],
        capabilityIssuer,
        cwd: '/project',
        fs: mockFs,
        fileFilter: (path) => ({
          status: path === '.env.example' ? 'allow-example' : 'allow',
        }),
      })

      expect(result.results[0]).toMatchObject({
        selector: 'file',
        status: 'ok',
        template: true,
        content: 'A=example',
        editAnchor: {
          startLine: 1,
          endLine: 1,
          contentHash: getContentHash('A=example'),
        },
      })
      const completeFile = result.results[0]
      const readCapability =
        completeFile &&
        completeFile.status !== 'error' &&
        completeFile.selector === 'file'
          ? completeFile.editAnchor?.readCapability
          : undefined
      expect(readCapability).toBeString()
      expect(readCapability).toMatch(/^cap\./)
      expect(
        typeof readCapability === 'string'
          ? decodeReadCapabilityToken(readCapability)
          : undefined,
      ).toMatchObject({
        startLine: 1,
        endLine: 1,
        hash: getContentHash('A=example'),
        tokenVersion: 'v3',
      })
      // A ~100k-char file is now under the 10MB read ceiling, so it renders
      // fully as a complete (non-truncated) result rather than a partial.
      expect(result.results[1]).toMatchObject({
        selector: 'file',
        status: 'ok',
        complete: true,
        content: largeContent,
      })
      const largeFile = result.results[1]
      expect(
        largeFile && 'truncation' in largeFile
          ? largeFile.truncation
          : undefined,
      ).toBeUndefined()
    })

    test('exposes an edit capability for a large ranged slice under the 10MB read ceiling', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/large.ts': {
            content: Array.from(
              { length: 2_000 },
              (_, index) => `${index + 1}:${'x'.repeat(80)}`,
            ).join('\n'),
          },
        },
      })

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'src/large.ts', startLine: 1, endLine: 2_000 }],
        capabilityIssuer: { projectId: '/project', runId: 'run-large-range' },
        cwd: '/project',
        fs: mockFs,
      })
      const item = result.results[0]

      // The render cap is now the 10MB byte gate, so a ~166k-char ranged slice
      // renders completely with a valid rangeHash and readCapability.
      expect(item).toMatchObject({
        selector: 'range',
        status: 'ok',
        complete: true,
      })
      expect(
        item && 'editAnchor' in item ? item.editAnchor?.contentHash : undefined,
      ).toMatch(/^sha256:/)
      expect(
        item && 'editAnchor' in item
          ? item.editAnchor?.readCapability
          : undefined,
      ).toMatch(/^cap\./)
      expect(item).not.toHaveProperty('rangeHash')
      expect(item).not.toHaveProperty('readCapability')
    })

    test('does not mint an edit capability without a runtime issuer', async () => {
      const result = await getFilesStructured({
        filePaths: ['src/no-issuer.ts'],
        cwd: '/project',
        fs: createMockFs({
          files: { '/project/src/no-issuer.ts': { content: 'export {}\n' } },
        }),
      })

      expect(result.results[0]).toMatchObject({
        selector: 'file',
        status: 'ok',
        complete: true,
      })
      expect(JSON.stringify(result.results[0])).not.toContain('readCapability')
    })

    test('does not mistake ordinary marker-like source text for status', async () => {
      const source =
        '[FILE_DOES_NOT_EXIST]\nconst note = "[FILE_TOO_LARGE: literal]"\n'
      const result = await getFilesStructured({
        filePaths: ['src/markers.ts'],
        cwd: '/project',
        fs: createMockFs({
          files: { '/project/src/markers.ts': { content: source } },
        }),
      })

      expect(result).toMatchObject({ status: 'ok', summary: { ok: 1 } })
      expect(result.results[0]).toMatchObject({
        selector: 'file',
        status: 'ok',
        complete: true,
        content: source,
      })
    })

    test('[SEC-H01] blocks case variants and sensitive canonical symlink targets', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/real/.ENV': { content: 'SECRET=value' },
        },
      })
      mockFs.realpath = (async (filePath: PathLike) => {
        const value = String(filePath)
        if (value === '/project/alias') return '/project/real/.ENV'
        return value
      }) as CodebuffFileSystem['realpath']

      const direct = await getFilesStructured({
        filePaths: ['.ENV'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow' }),
      })
      const aliased = await getFilesStructured({
        filePaths: ['alias'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow' }),
      })

      expect(direct.results[0]).toMatchObject({
        status: 'error',
        error: { code: 'blocked' },
      })
      expect(aliased.results[0]).toMatchObject({
        status: 'error',
        error: { code: 'blocked' },
      })
    })

    test('[COR-M11] returns typed binary and unsupported-encoding failures without capabilities', async () => {
      const result = await getFilesStructured({
        filePaths: ['binary.dat', 'latin1.txt'],
        ranges: [{ path: 'binary.dat', startLine: 1, endLine: 1 }],
        cwd: '/project',
        fs: createMockFs({
          files: {
            '/project/binary.dat': {
              content: new Uint8Array([0x61, 0, 0x62]),
            },
            '/project/latin1.txt': {
              content: new Uint8Array([0xc3, 0x28]),
            },
          },
        }),
      })

      expect(result.results.map((item) => item.status)).toEqual([
        'error',
        'error',
        'error',
      ])
      expect(result.results[0]).toMatchObject({ error: { code: 'binary' } })
      expect(result.results[1]).toMatchObject({
        error: { code: 'unsupported_encoding' },
      })
      expect(JSON.stringify(result)).not.toContain('readCapability')
    })

    test('[PERF-M01] snapshots duplicate aliases and mixed selectors for one canonical path once', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'one\ntwo\nthree' },
        },
      })
      const originalReadFile = mockFs.readFile.bind(mockFs)
      mockFs.realpath = (async (filePath: PathLike) => {
        const value = String(filePath)
        return value === '/project/alias.ts' ? '/project/src/index.ts' : value
      }) as CodebuffFileSystem['realpath']
      let readCount = 0
      mockFs.readFile = (async (
        ...args: Parameters<typeof mockFs.readFile>
      ) => {
        readCount += 1
        return originalReadFile(...args)
      }) as CodebuffFileSystem['readFile']

      const result = await getFilesStructured({
        filePaths: ['src/index.ts', 'alias.ts'],
        ranges: [
          { path: 'src/index.ts', startLine: 1, endLine: 1 },
          { path: 'alias.ts', startLine: 3, endLine: 3 },
        ],
        cwd: '/project',
        fs: mockFs,
      })

      expect(readCount).toBe(1)
      expect(result.results.map((item) => item.requestIndex)).toEqual([
        0, 1, 2, 3,
      ])
      expect(result.results[2]).toMatchObject({
        content: expect.stringContaining('one'),
      })
      expect(result.results[3]).toMatchObject({
        content: expect.stringContaining('three'),
      })
    })

    test('[PERF-M01] caps active unique snapshots at READ_SNAPSHOT_CONCURRENCY', async () => {
      const files = Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          `/project/file-${index}.ts`,
          { content: `file ${index}` },
        ]),
      )
      const mockFs = createMockFs({ files })
      const originalReadFile = mockFs.readFile.bind(mockFs)
      let active = 0
      let maxActive = 0
      let started = 0
      let release!: () => void
      let markLimitReached!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const limitReached = new Promise<void>((resolve) => {
        markLimitReached = resolve
      })
      mockFs.readFile = (async (
        ...args: Parameters<typeof mockFs.readFile>
      ) => {
        active += 1
        started += 1
        maxActive = Math.max(maxActive, active)
        if (started === READ_SNAPSHOT_CONCURRENCY) markLimitReached()
        await gate
        try {
          return await originalReadFile(...args)
        } finally {
          active -= 1
        }
      }) as CodebuffFileSystem['readFile']

      const pending = getFilesStructured({
        filePaths: Array.from({ length: 12 }, (_, index) => `file-${index}.ts`),
        cwd: '/project',
        fs: mockFs,
      })
      await limitReached
      expect(maxActive).toBe(READ_SNAPSHOT_CONCURRENCY)
      release()
      await pending
      expect(maxActive).toBeLessThanOrEqual(READ_SNAPSHOT_CONCURRENCY)
    })

    test('[ERR-M04] reads an oversized range through one bounded text-range operation', async () => {
      let wholeReads = 0
      let rangeArgs: unknown[] | undefined
      const mockFs = createMockFs({
        files: {
          '/project/huge.ts': {
            content: '',
            size: 20 * 1024 * 1024,
          },
        },
        capabilities: {
          readTextRange: async (...args) => {
            rangeArgs = args
            return {
              data: Buffer.from('line 20\nline 21'),
              startLine: 20,
              endLine: 21,
              totalLines: 50_000,
              complete: true,
            }
          },
        },
      })
      mockFs.readFile = (async () => {
        wholeReads += 1
        throw new Error('whole-file read must not run')
      }) as CodebuffFileSystem['readFile']

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'huge.ts', startLine: 20, endLine: 21 }],
        cwd: '/project',
        fs: mockFs,
      })

      expect(wholeReads).toBe(0)
      expect(rangeArgs?.slice(1)).toEqual([20, 21, MAX_RANGE_READ_BYTES])
      expect(result.results[0]).toMatchObject({
        selector: 'range',
        status: 'ok',
        startLine: 20,
        endLine: 21,
      })
    })

    test('reads distant oversized ranges as independent bounded windows', async () => {
      const rangeCalls: Array<[number, number, number]> = []
      const mockFs = createMockFs({
        files: {
          '/project/huge.ts': {
            content: '',
            size: 20 * 1024 * 1024,
          },
        },
        capabilities: {
          readTextRange: async (_path, startLine, endLine, maxBytes) => {
            rangeCalls.push([startLine, endLine, maxBytes])
            return {
              data: Buffer.from(`line ${startLine}\nline ${endLine}`),
              startLine,
              endLine,
              totalLines: 50_000,
              complete: true,
            }
          },
        },
      })

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [
          { path: 'huge.ts', startLine: 20, endLine: 21 },
          { path: 'huge.ts', startLine: 40_000, endLine: 40_001 },
        ],
        cwd: '/project',
        fs: mockFs,
      })

      expect(rangeCalls).toEqual([
        [20, 21, MAX_RANGE_READ_BYTES],
        [40_000, 40_001, MAX_RANGE_READ_BYTES],
      ])
      expect(result.results).toHaveLength(2)
      expect(result.results.every((item) => item.status === 'ok')).toBe(true)
    })

    test('mints scoped v3 capabilities when the runtime supplies an issuer', async () => {
      const capabilityIssuer = {
        projectId: '/project',
        runId: 'run-123',
      }
      const result = await getFilesStructured({
        filePaths: ['src/index.ts'],
        cwd: '/project',
        fs: createMockFs({
          files: {
            '/project/src/index.ts': { content: 'export const value = 1\n' },
          },
        }),
        capabilityIssuer,
      })
      const item = result.results[0]
      expect(item?.status).toBe('ok')
      if (item?.status !== 'error' && item.selector === 'file') {
        expect(item.editAnchor?.readCapability).toMatch(/^cap\.v3\./)
        expect(item).not.toHaveProperty('readCapability')
        const decoded = decodeReadCapabilityToken(
          item.editAnchor?.readCapability ?? '',
        )
        expect(typeof decoded).toBe('object')
        if (typeof decoded !== 'string') {
          expect(
            readCapabilityMatchesScope(decoded, {
              ...capabilityIssuer,
              path: 'src/index.ts',
            }),
          ).toBe(true)
        }
      }
    })

    test('proper-subset range exposes only its rendered-range capability', async () => {
      const capabilityIssuer = { projectId: '/project', runId: 'run-range-1' }
      const content = 'line 1\nline 2\nline 3\nline 4\nline 5'
      const mockFs = createMockFs({
        files: { '/project/src/multi.ts': { content } },
      })

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'src/multi.ts', startLine: 2, endLine: 3 }],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })
      const item = result.results[0]
      expect(item?.status).toBe('ok')
      if (item?.status !== 'error' && item.selector === 'range') {
        expect(item.editAnchor?.readCapability).toMatch(/^cap\.v3\./)
        expect('wholeFileReadCapability' in item).toBe(false)
        const decoded = decodeReadCapabilityToken(
          item.editAnchor?.readCapability ?? '',
        )
        if (typeof decoded === 'string') throw new Error(decoded)
        expect(decoded.startLine).toBe(2)
        expect(decoded.endLine).toBe(3)
        expect(decoded.hash).toBe(getContentHash('line 2\nline 3'))
        expect(
          readCapabilityMatchesScope(decoded, {
            ...capabilityIssuer,
            path: 'src/multi.ts',
          }),
        ).toBe(true)
      }
    })

    test('whole-file range exposes one capability spanning its own bounds', async () => {
      const capabilityIssuer = { projectId: '/project', runId: 'run-range-2' }
      const content = 'line 1\nline 2\nline 3\nline 4\nline 5'
      const mockFs = createMockFs({
        files: { '/project/src/multi.ts': { content } },
      })

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'src/multi.ts' }],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })
      const item = result.results[0]
      expect(item?.status).toBe('ok')
      if (item?.status !== 'error' && item.selector === 'range') {
        expect(item.editAnchor?.readCapability).toMatch(/^cap\.v3\./)
        expect('wholeFileReadCapability' in item).toBe(false)
        const decoded = decodeReadCapabilityToken(
          item.editAnchor?.readCapability ?? '',
        )
        if (typeof decoded === 'string') throw new Error(decoded)
        expect(decoded.startLine).toBe(1)
        expect(decoded.endLine).toBe(5)
        expect(decoded.hash).toBe(getContentHash(content))
      }
    })

    test('oversized range-window read exposes only its bounded capability', async () => {
      const capabilityIssuer = { projectId: '/project', runId: 'run-range-3' }
      const mockFs = createMockFs({
        files: {
          '/project/huge.ts': { content: '', size: 20 * 1024 * 1024 },
        },
        capabilities: {
          readTextRange: async () => ({
            data: Buffer.from('line 20\nline 21'),
            startLine: 20,
            endLine: 21,
            totalLines: 50_000,
            complete: true,
          }),
        },
      })
      mockFs.readFile = (async () => {
        throw new Error('whole-file read must not run for oversized range read')
      }) as CodebuffFileSystem['readFile']

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'huge.ts', startLine: 20, endLine: 21 }],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })
      const item = result.results[0]
      expect(item?.status).toBe('ok')
      if (item?.status !== 'error' && item.selector === 'range') {
        expect(item.editAnchor?.readCapability).toMatch(/^cap\.v3\./)
        expect('wholeFileReadCapability' in item).toBe(false)
      }
    })

    test('large full-snapshot range still exposes only its range capability', async () => {
      const capabilityIssuer = { projectId: '/project', runId: 'run-range-4' }
      const largeContent = Array.from(
        { length: 30_000 },
        (_, index) => `line ${index + 1}`,
      ).join('\n')
      const mockFs = createMockFs({
        files: {
          '/project/src/large.ts': {
            content: largeContent,
            size: largeContent.length,
          },
        },
      })

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [
          { path: 'src/large.ts', startLine: 20_000, endLine: 20_002 },
        ],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })
      const item = result.results[0]
      expect(item?.status).toBe('ok')
      if (item?.status !== 'error' && item.selector === 'range') {
        expect(item.complete).toBe(true)
        expect(item.editAnchor?.readCapability).toMatch(/^cap\.v3\./)
        expect('wholeFileReadCapability' in item).toBe(false)
      }
    })

    test('[ERR-M04] returns typed unsupported without retrying when range capability is absent', async () => {
      let wholeReads = 0
      const mockFs = createMockFs({
        files: {
          '/project/huge.ts': {
            content: '',
            size: 20 * 1024 * 1024,
          },
        },
      })
      mockFs.readFile = (async () => {
        wholeReads += 1
        return Buffer.from('unexpected')
      }) as unknown as CodebuffFileSystem['readFile']

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'huge.ts', startLine: 20, endLine: 21 }],
        cwd: '/project',
        fs: mockFs,
      })

      expect(wholeReads).toBe(0)
      expect(result.results[0]).toMatchObject({
        status: 'error',
        error: { code: 'unsupported', retryable: false },
      })
    })
  })

  test('[SEC-H02] optional file reads preserve not-found, blocked, and I/O states', async () => {
    const missing = await getFileForEditResult({
      filePath: 'missing.ts',
      cwd: '/project',
      fs: createMockFs({}),
    })
    const blocked = await getFileForEditResult({
      filePath: '.ENV',
      cwd: '/project',
      fs: createMockFs({ files: { '/project/.ENV': { content: 'secret' } } }),
      fileFilter: () => ({ status: 'allow' }),
    })
    const ioError = await getFileForEditResult({
      filePath: 'broken.ts',
      cwd: '/project',
      fs: createMockFs({
        errors: { '/project/broken.ts': { code: 'EACCES' } },
      }),
    })

    expect(missing).toMatchObject({ status: 'not_found' })
    expect(blocked).toMatchObject({ status: 'blocked' })
    expect(ioError).toMatchObject({ status: 'io_error' })
  })

  test('[COR-M06] preserves returned v1 successes and fills one result per missing selector', async () => {
    const result = await getFilesStructuredFromOverride({
      filePaths: ['a.ts', 'b.ts'],
      override: async () => ({
        kind: 'read_files_result',
        version: 1,
        status: 'ok',
        summary: {
          requested: 1,
          ok: 1,
          partial: 0,
          failed: 0,
          uniquePaths: 1,
        },
        results: [
          {
            selector: 'file',
            requestIndex: 0,
            path: 'a.ts',
            status: 'ok',
            content: 'A',
            complete: true,
            template: false,
          },
        ],
      }),
    })

    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({ status: 'ok', content: 'A' })
    expect(result.results[1]).toMatchObject({
      status: 'error',
      path: 'b.ts',
      error: { code: 'invalid_request' },
    })
  })

  test('correlates reordered same-path range overrides by coordinates', async () => {
    const makeRange = (
      requestIndex: number,
      startLine: number,
      content: string,
    ) => ({
      selector: 'range' as const,
      requestIndex,
      path: 'same.ts',
      status: 'ok' as const,
      content,
      startLine,
      endLine: startLine,
      totalLines: 20,
      complete: true,
      editAnchor: {
        startLine,
        endLine: startLine,
        contentHash: `sha256:${'a'.repeat(64)}`,
        readCapability: `cap.v3.${startLine}`,
      },
    })
    const result = await getFilesStructuredFromOverride({
      filePaths: [],
      ranges: [
        { path: 'same.ts', startLine: 2, endLine: 2 },
        { path: 'same.ts', startLine: 10, endLine: 10 },
      ],
      override: async () => ({
        kind: 'read_files_result',
        version: 1,
        status: 'ok',
        summary: { requested: 2, ok: 2, partial: 0, failed: 0, uniquePaths: 1 },
        results: [makeRange(0, 10, 'ten'), makeRange(1, 2, 'two')],
      }),
    })

    expect(
      result.results.map((item) =>
        item.selector === 'range' && item.status !== 'error'
          ? item.startLine
          : null,
      ),
    ).toEqual([2, 10])
  })

  describe('whole-file editAnchor with edit_transaction replace_range', () => {
    test('rejects legacy explicit range fields alongside a capability', async () => {
      const capabilityIssuer = {
        projectId: '/project',
        runId: 'run-e2e-trailing',
      }
      const content = 'line 1\nline 2\nline 3\n'
      const mockFs = createMockFs({
        files: { '/project/src/trailing.ts': { content } },
      })

      const readResult = await getFilesStructured({
        filePaths: ['src/trailing.ts'],
        ranges: [],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })
      const fileItem = readResult.results[0]
      if (
        fileItem?.status !== 'ok' ||
        fileItem.selector !== 'file' ||
        !fileItem.editAnchor
      ) {
        throw new Error('expected a complete whole-file result with editAnchor')
      }
      const wholeFileCap = fileItem.editAnchor.readCapability
      const decoded = decodeReadCapabilityToken(wholeFileCap)
      if (typeof decoded === 'string') throw new Error(decoded)
      expect(decoded.startLine).toBe(1)
      expect(decoded.endLine).toBe(4)
      expect(decoded.hash).toBe(getContentHash(content))
      expect(
        readCapabilityMatchesScope(decoded, {
          ...capabilityIssuer,
          path: 'src/trailing.ts',
        }),
      ).toBe(true)

      const parsed = editTransactionParams.inputSchema.parse({
        edits: [
          {
            type: 'replace_range',
            path: 'src/trailing.ts',
            readCapability: wholeFileCap,
            startLine: 2,
            endLine: 4,
            newContent: 'line 2\nline 3\nline 3b',
          },
        ],
      })
      expect(parsed.edits[0]).toMatchObject({
        type: 'replace_range',
        startLine: 2,
        endLine: 4,
        capabilityStartLine: 1,
        capabilityEndLine: 4,
        capabilityHash: getContentHash(content),
      })
      expect(() =>
        editTransactionParams.inputSchema.parse({
          edits: [
            {
              type: 'replace_range',
              path: 'src/trailing.ts',
              readCapability: wholeFileCap,
              expectedHash: getContentHash(content),
              newContent: 'line 2\nline 3\nline 3b',
            },
          ],
        }),
      ).toThrow()
    })

    test('whole-file capability alone derives its exact bounds and hash', async () => {
      const capabilityIssuer = {
        projectId: '/project',
        runId: 'run-e2e-cap-only',
      }
      const content = 'line 1\nline 2\nline 3\nline 4\n'
      const mockFs = createMockFs({
        files: { '/project/src/multi-trail.ts': { content } },
      })

      const readResult = await getFilesStructured({
        filePaths: ['src/multi-trail.ts'],
        ranges: [],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })
      const fileItem = readResult.results[0]
      if (
        fileItem?.status !== 'ok' ||
        fileItem.selector !== 'file' ||
        !fileItem.editAnchor
      ) {
        throw new Error('expected a complete whole-file result with editAnchor')
      }
      const wholeFileCap = fileItem.editAnchor.readCapability
      const decoded = decodeReadCapabilityToken(wholeFileCap)
      if (typeof decoded === 'string') throw new Error(decoded)
      expect(decoded.startLine).toBe(1)
      expect(decoded.endLine).toBe(5)

      const parsed = editTransactionParams.inputSchema.parse({
        edits: [
          {
            type: 'replace_range',
            path: 'src/multi-trail.ts',
            readCapability: wholeFileCap,
            newContent: 'line 1\nline 2\nline 3\nline four\n',
          },
        ],
      })
      const transformed = (parsed.edits as unknown[])[0] as Record<
        string,
        unknown
      >
      expect(transformed).toMatchObject({
        type: 'replace_range',
        path: 'src/multi-trail.ts',
        startLine: decoded.startLine,
        endLine: decoded.endLine,
        capabilityStartLine: decoded.startLine,
        capabilityEndLine: decoded.endLine,
        capabilityHash: decoded.hash,
      })
      expect(transformed).not.toHaveProperty('expectedHash')
    })
  })
})
