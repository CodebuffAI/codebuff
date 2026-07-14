import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
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
  getFiles,
  getFilesStructured,
  getFilesStructuredFromOverride,
} from '../tools/read-files'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { PathLike } from 'node:fs'

// Helper to create a mock filesystem
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
      if (files[pathStr]) {
        return files[pathStr].content
      }
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

describe('getFiles', () => {
  let isFileIgnoredSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    // Default: no files are ignored
    isFileIgnoredSpy = spyOn(
      projectFileTree,
      'isFileIgnored',
    ).mockResolvedValue(false)
  })

  afterEach(() => {
    mock.restore()
  })

  describe('reading normal files', () => {
    test('should return file content for a valid file', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'console.log("hello")' },
        },
      })

      const result = await getFiles({
        filePaths: ['src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/index.ts']).toBe('console.log("hello")')
    })

    test('should handle multiple files', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/a.ts': { content: 'file a' },
          '/project/src/b.ts': { content: 'file b' },
        },
      })

      const result = await getFiles({
        filePaths: ['src/a.ts', 'src/b.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/a.ts']).toBe('file a')
      expect(result['src/b.ts']).toBe('file b')
    })

    test('should skip empty file paths', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'content' },
        },
      })

      const result = await getFiles({
        filePaths: ['', 'src/index.ts', ''],
        cwd: '/project',
        fs: mockFs,
      })

      expect(Object.keys(result)).toEqual(['src/index.ts'])
      expect(result['src/index.ts']).toBe('content')
    })
  })

  describe('file not found', () => {
    test('should return DOES_NOT_EXIST for missing files', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['nonexistent.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['nonexistent.ts']).toBe(FILE_READ_STATUS.DOES_NOT_EXIST)
    })
  })

  describe('file outside project', () => {
    test('should return OUTSIDE_PROJECT for absolute paths outside project', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['/etc/passwd'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['/etc/passwd']).toBe(FILE_READ_STATUS.OUTSIDE_PROJECT)
    })

    test('should return OUTSIDE_PROJECT for relative paths that escape project', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['../outside/secret.txt'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['../outside/secret.txt']).toBe(
        FILE_READ_STATUS.OUTSIDE_PROJECT,
      )
    })
  })

  describe('file too large', () => {
    test('should truncate files over 100k chars to first 100k chars with message', async () => {
      const largeContent = 'x'.repeat(100_001) + 'y'.repeat(1000) // over limit
      const mockFs = createMockFs({
        files: {
          '/project/large.bin': {
            content: largeContent,
            size: largeContent.length,
          },
        },
      })

      const result = await getFiles({
        filePaths: ['large.bin'],
        cwd: '/project',
        fs: mockFs,
      })

      // Should contain first 100k chars
      expect(result['large.bin']).toContain('x'.repeat(100_000))
      // Should NOT contain content beyond the limit
      expect(result['large.bin']).not.toContain('y')
      // Should contain truncation message
      expect(result['large.bin']).toContain('FILE_TOO_LARGE')
      expect(result['large.bin']).toContain('101,001 chars')
      expect(result['large.bin']).toContain('1 lines')
      expect(result['large.bin']).toContain(
        'Do not edit from this truncated content',
      )
      expect(result['large.bin']).toContain(
        'Large-file edits require basedOnRead',
      )
      expect(result['large.bin']).toContain(
        'ranges: [{ path: "large.bin", startLine, endLine }]',
      )
    })

    test('should read files at exactly 100k chars', async () => {
      const exactly100kContent = 'x'.repeat(100_000) // exactly 100k chars
      const mockFs = createMockFs({
        files: {
          '/project/exactly100k.bin': {
            content: exactly100kContent,
            size: exactly100kContent.length,
          },
        },
      })

      const result = await getFiles({
        filePaths: ['exactly100k.bin'],
        cwd: '/project',
        fs: mockFs,
      })

      // Should be read fully (no truncation message)
      expect(result['exactly100k.bin']).toBe(exactly100kContent)
      expect(result['exactly100k.bin']).not.toContain('FILE_TOO_LARGE')
    })

    test('should reject files over 10MB without reading them', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/huge.bin': {
            content: 'x',
            size: 15 * 1024 * 1024, // 15MB
          },
        },
      })

      const result = await getFiles({
        filePaths: ['huge.bin'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['huge.bin']).toContain(FILE_READ_STATUS.TOO_LARGE)
      expect(result['huge.bin']).toContain('15.0MB')
    })

    test('should read files just under 100k chars', async () => {
      const justUnder100k = 'x'.repeat(99_000) // under limit
      const mockFs = createMockFs({
        files: {
          '/project/underlimit.bin': {
            content: justUnder100k,
            size: justUnder100k.length,
          },
        },
      })

      const result = await getFiles({
        filePaths: ['underlimit.bin'],
        cwd: '/project',
        fs: mockFs,
      })

      // Should be read fully (no truncation message)
      expect(result['underlimit.bin']).toBe(justUnder100k)
      expect(result['underlimit.bin']).not.toContain('FILE_TOO_LARGE')
    })
  })

  describe('gitignore blocking', () => {
    test('should return IGNORED for gitignored files', async () => {
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/node_modules/package/index.js': { content: 'module code' },
        },
      })

      const result = await getFiles({
        filePaths: ['node_modules/package/index.js'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['node_modules/package/index.js']).toBe(
        FILE_READ_STATUS.IGNORED,
      )
    })

    test('should call isFileIgnored with correct parameters', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'content' },
        },
      })

      await getFiles({
        filePaths: ['src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(isFileIgnoredSpy).toHaveBeenCalledWith({
        filePath: 'src/index.ts',
        projectRoot: '/project',
        fs: mockFs,
      })
    })

    test('should handle mix of ignored and non-ignored files', async () => {
      // First call returns false (not ignored), second returns true (ignored)
      isFileIgnoredSpy.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'main code' },
          '/project/node_modules/pkg/index.js': { content: 'dependency' },
        },
      })

      const result = await getFiles({
        filePaths: ['src/index.ts', 'node_modules/pkg/index.js'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/index.ts']).toBe('main code')
      expect(result['node_modules/pkg/index.js']).toBe(FILE_READ_STATUS.IGNORED)
    })
  })

  describe('default gitignore behavior', () => {
    test('should block gitignored files when no fileFilter is provided', async () => {
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/node_modules/pkg/index.js': { content: 'module code' },
        },
      })

      const result = await getFiles({
        filePaths: ['node_modules/pkg/index.js'],
        cwd: '/project',
        fs: mockFs,
        // No fileFilter provided - SDK applies default gitignore checking
      })

      expect(result['node_modules/pkg/index.js']).toBe(FILE_READ_STATUS.IGNORED)
      expect(isFileIgnoredSpy).toHaveBeenCalled()
    })

    test('[SEC-H01] composes a custom allow filter with mandatory ignore policy', async () => {
      // File would normally be ignored by gitignore
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/node_modules/pkg/index.js': { content: 'module code' },
        },
      })

      const result = await getFiles({
        filePaths: ['node_modules/pkg/index.js'],
        cwd: '/project',
        fs: mockFs,
        // Caller provides a filter that allows everything
        fileFilter: () => ({ status: 'allow' }),
      })

      expect(result['node_modules/pkg/index.js']).toBe(FILE_READ_STATUS.IGNORED)
      expect(isFileIgnoredSpy).toHaveBeenCalled()
    })
  })

  describe('ranged reads', () => {
    const multiLine = Array.from(
      { length: 10 },
      (_, i) => `line ${i + 1}`,
    ).join('\n')

    test('should return only the requested line slice with a header', async () => {
      const mockFs = createMockFs({
        files: { '/project/src/big.ts': { content: multiLine } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/big.ts', startLine: 3, endLine: 5 }],
      })

      expect(result['src/big.ts']).toMatch(
        /^\[RANGE_BLOCK lines 3-5 of 10 in src\/big\.ts; rangeHash=sha256:[a-f0-9]{64}; readCapability=cap\.v2\.3\.5\.[A-Za-z0-9_-]{43}; preferred block edit: replace_range \{ readCapability: "cap\.v2\.3\.5\.[A-Za-z0-9_-]{43}", newContent: "\.\.\." \}; scoped str_replace: basedOnRead="cap\.v2\.3\.5\.[A-Za-z0-9_-]{43}"\]\n3\tline 3\n4\tline 4\n5\tline 5$/,
      )
    })

    test('should default startLine to 1 and endLine to last line', async () => {
      const mockFs = createMockFs({
        files: { '/project/src/big.ts': { content: multiLine } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/big.ts' }],
      })

      expect(result['src/big.ts']).toMatch(
        /^\[RANGE_BLOCK lines 1-10 of 10 in src\/big\.ts; rangeHash=sha256:[a-f0-9]{64}; readCapability=cap\.v2\.1\.10\.[A-Za-z0-9_-]{43};/,
      )
      // Each body line is prefixed with its 1-indexed line number (cat -n style).
      for (let i = 1; i <= 10; i++) {
        expect(result['src/big.ts']).toContain(
          `${String(i).padStart(2, ' ')}\tline ${i}`,
        )
      }
    })

    test('does not mint a phantom trailing line in range hashes', async () => {
      const content = 'line 1\nline 2\n'
      const mockFs = createMockFs({
        files: { '/project/src/trailing-newline.ts': { content } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/trailing-newline.ts' }],
      })

      const rendered = result['src/trailing-newline.ts']
      expect(rendered).toContain('[RANGE_BLOCK lines 1-2 of 2')
      expect(rendered).toContain(
        `rangeHash=${getContentHash('line 1\nline 2')}`,
      )
      expect(rendered).not.toContain('\n3\t')
    })

    test('normalizes CRLF before minting a range hash', async () => {
      const content = 'line 1\r\nline 2\r\n'
      const mockFs = createMockFs({
        files: { '/project/src/crlf.ts': { content } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/crlf.ts' }],
      })

      const rendered = result['src/crlf.ts']
      expect(rendered).toContain('[RANGE_BLOCK lines 1-2 of 2')
      expect(rendered).toContain(
        `rangeHash=${getContentHash('line 1\nline 2')}`,
      )
      expect(rendered).toContain('1\tline 1\n2\tline 2')
      expect(rendered).not.toContain('\r')
    })

    test('should clamp endLine to the last line', async () => {
      const mockFs = createMockFs({
        files: { '/project/src/big.ts': { content: multiLine } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/big.ts', startLine: 8, endLine: 9999 }],
      })

      expect(result['src/big.ts']).toContain(
        '[RANGE_BLOCK lines 8-10 of 10 in src/big.ts; rangeHash=sha256:',
      )
      expect(result['src/big.ts']).toContain(
        'preferred block edit: replace_range { readCapability: "cap.',
      )
      expect(result['src/big.ts']).toContain(
        ' 8\tline 8\n 9\tline 9\n10\tline 10',
      )
    })

    test('should report when startLine is beyond the end of the file', async () => {
      const mockFs = createMockFs({
        files: { '/project/src/big.ts': { content: multiLine } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/big.ts', startLine: 50 }],
      })

      expect(result['src/big.ts']).toContain('has only 10 lines')
    })

    test('ranged value wins when a path is in both filePaths and ranges', async () => {
      const mockFs = createMockFs({
        files: { '/project/src/big.ts': { content: multiLine } },
      })

      const result = await getFiles({
        filePaths: ['src/big.ts'],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/big.ts', startLine: 1, endLine: 2 }],
      })

      expect(result['src/big.ts']).toContain(
        '[RANGE_BLOCK lines 1-2 of 10 in src/big.ts; rangeHash=sha256:',
      )
      expect(result['src/big.ts']).toContain(
        'preferred block edit: replace_range { readCapability: "cap.',
      )
      expect(result['src/big.ts']).toContain('1\tline 1\n2\tline 2')
    })

    test('returns every range when multiple ranges target the same file', async () => {
      const mockFs = createMockFs({
        files: { '/project/src/big.ts': { content: multiLine } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [
          { path: 'src/big.ts', startLine: 1, endLine: 2 },
          { path: 'src/big.ts', startLine: 8, endLine: 9 },
        ],
      })

      // Both ranges must be present; the later range must not overwrite the
      // earlier one (the historical large-file read failure).
      expect(result['src/big.ts']).toContain(
        '[RANGE_BLOCK lines 1-2 of 10 in src/big.ts',
      )
      expect(result['src/big.ts']).toContain('1\tline 1')
      expect(result['src/big.ts']).toContain(
        '[RANGE_BLOCK lines 8-9 of 10 in src/big.ts',
      )
      expect(result['src/big.ts']).toContain('9\tline 9')
    })

    test('should allow ranged reads for files over the whole-file 100k char truncation threshold', async () => {
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

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/large.ts', startLine: 20_000, endLine: 20_002 }],
      })

      expect(result['src/large.ts']).toContain(
        '[RANGE_BLOCK lines 20000-20002 of 30,000 in src/large.ts; rangeHash=sha256:',
      )
      expect(result['src/large.ts']).toContain(
        'preferred block edit: replace_range { readCapability: "cap.',
      )
      expect(result['src/large.ts']).toContain(
        '20000\tline 20000\n20001\tline 20001\n20002\tline 20002',
      )
    })

    test('should apply the 100k cap to a large ranged slice', async () => {
      const hugeLine = 'x'.repeat(100_050)
      const mockFs = createMockFs({
        files: { '/project/src/huge.ts': { content: hugeLine } },
      })

      const result = await getFiles({
        filePaths: [],
        cwd: '/project',
        fs: mockFs,
        ranges: [{ path: 'src/huge.ts', startLine: 1, endLine: 1 }],
      })

      expect(result['src/huge.ts']).toContain(
        'rangeHash=omitted; readCapability=omitted',
      )
      expect(result['src/huge.ts']).toContain('FILE_TOO_LARGE')
      expect(result['src/huge.ts']).toContain(
        'do not edit from this truncated range',
      )
    })

    test('regression: plain reads are unaffected when no ranges given', async () => {
      const mockFs = createMockFs({
        files: { '/project/src/index.ts': { content: 'console.log(1)' } },
      })

      const result = await getFiles({
        filePaths: ['src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['src/index.ts']).toBe('console.log(1)')
    })
  })

  describe('file read errors', () => {
    test('should return ERROR for unexpected read errors', async () => {
      const mockFs = createMockFs({
        files: {},
        errors: {
          '/project/broken.ts': {
            code: 'EACCES',
            message: 'Permission denied',
          },
        },
      })

      const result = await getFiles({
        filePaths: ['broken.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['broken.ts']).toBe(FILE_READ_STATUS.ERROR)
    })
  })

  describe('path normalization', () => {
    test('[SEC-H01] rejects prompt-supplied absolute paths even inside the project', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/src/index.ts': { content: 'content' },
        },
      })

      const result = await getFiles({
        filePaths: ['/project/src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['/project/src/index.ts']).toBe(
        FILE_READ_STATUS.OUTSIDE_PROJECT,
      )
    })

    test('should reject absolute paths in sibling directories with matching prefixes', async () => {
      const mockFs = createMockFs({
        files: {
          '/project-other/src/index.ts': { content: 'outside' },
        },
      })

      const result = await getFiles({
        filePaths: ['/project-other/src/index.ts'],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result['/project-other/src/index.ts']).toBe(
        FILE_READ_STATUS.OUTSIDE_PROJECT,
      )
    })
  })

  describe('fileFilter option', () => {
    test('should block files when filter returns blocked status', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/.env': { content: 'SECRET=value' },
          '/project/src/index.ts': { content: 'normal file' },
        },
      })

      const result = await getFiles({
        filePaths: ['.env', 'src/index.ts'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: (path) => {
          if (path === '.env') return { status: 'blocked' }
          return { status: 'allow' }
        },
      })

      expect(result['.env']).toBe(FILE_READ_STATUS.IGNORED)
      expect(result['src/index.ts']).toBe('normal file')
    })

    test('should mark template files with TEMPLATE prefix', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/.env.example': { content: 'API_KEY=your_key_here' },
        },
      })

      const result = await getFiles({
        filePaths: ['.env.example'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow-example' }),
      })

      expect(result['.env.example']).toBe(
        FILE_READ_STATUS.TEMPLATE + '\n' + 'API_KEY=your_key_here',
      )
    })

    test('should skip gitignore check for allow-example files', async () => {
      // When caller provides a filter that returns allow-example,
      // the file is read and marked with TEMPLATE prefix
      isFileIgnoredSpy.mockResolvedValue(true)

      const mockFs = createMockFs({
        files: {
          '/project/.env.example': { content: 'template content' },
        },
      })

      const result = await getFiles({
        filePaths: ['.env.example'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow-example' }),
      })

      // Should NOT be blocked since caller's filter marked it as allow-example
      expect(result['.env.example']).toBe(
        FILE_READ_STATUS.TEMPLATE + '\n' + 'template content',
      )
      // When a custom filter is provided, gitignore is not checked
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('should run filter before gitignore check', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/secret.key': { content: 'private key' },
        },
      })

      const result = await getFiles({
        filePaths: ['secret.key'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'blocked' }),
      })

      expect(result['secret.key']).toBe(FILE_READ_STATUS.IGNORED)
      // isFileIgnored should not have been called since filter blocked first
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('should still enforce other checks for template files', async () => {
      const mockFs = createMockFs({
        files: {},
      })

      const result = await getFiles({
        filePaths: ['/etc/passwd', 'nonexistent.txt'],
        cwd: '/project',
        fs: mockFs,
        fileFilter: () => ({ status: 'allow-example' }),
      })

      // Should still block files outside project
      expect(result['/etc/passwd']).toBe(FILE_READ_STATUS.OUTSIDE_PROJECT)
      // Should still report missing files
      expect(result['nonexistent.txt']).toBe(FILE_READ_STATUS.DOES_NOT_EXIST)
    })
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
      })
      expect(result.results[3]).toMatchObject({
        selector: 'range',
        status: 'ok',
        startLine: 3,
        endLine: 3,
      })
    })

    test('keeps template and truncation state out of content markers', async () => {
      const mockFs = createMockFs({
        files: {
          '/project/.env.example': { content: 'A=example' },
          '/project/src/large.ts': { content: 'x'.repeat(100_001) },
        },
      })

      const result = await getFilesStructured({
        filePaths: ['.env.example', 'src/large.ts'],
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
      })
      const completeFile = result.results[0]
      expect(
        completeFile && 'readCapability' in completeFile
          ? decodeReadCapabilityToken(completeFile.readCapability ?? '')
          : undefined,
      ).toEqual({
        startLine: 1,
        endLine: 1,
        hash: getContentHash('A=example'),
      })
      expect(result.results[1]).toMatchObject({
        selector: 'file',
        status: 'partial',
        complete: false,
        truncation: { reason: 'character_limit' },
      })
      const partialFile = result.results[1]
      expect(
        partialFile && 'readCapability' in partialFile
          ? partialFile.readCapability
          : undefined,
      ).toBeUndefined()
    })

    test('does not expose an edit capability for a truncated range', async () => {
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
        cwd: '/project',
        fs: mockFs,
      })
      const item = result.results[0]

      expect(item).toMatchObject({
        selector: 'range',
        status: 'partial',
        complete: false,
      })
      expect(
        item && 'rangeHash' in item ? item.rangeHash : undefined,
      ).toBeUndefined()
      expect(
        item && 'readCapability' in item ? item.readCapability : undefined,
      ).toBeUndefined()
      expect(item && 'content' in item ? item.content : '').not.toContain(
        'basedOnRead: "',
      )
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
        expect(item.readCapability).toMatch(/^cap\.v3\./)
        const decoded = decodeReadCapabilityToken(item.readCapability!)
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

  test('[ABI-M04] invokes v0 overrides once with the original ordered batch', async () => {
    const calls: unknown[] = []
    const result = await getFilesStructuredFromOverride({
      filePaths: ['a.ts', 'b.ts'],
      ranges: [{ path: 'c.ts', startLine: 2, endLine: 2 }],
      override: async (input) => {
        calls.push(input)
        return {
          'a.ts': 'A',
          'b.ts': 'B',
          'c.ts':
            '[RANGE_BLOCK lines 2-2 of 3 in c.ts; rangeHash=sha256:abc; readCapability=cap.abc]\n2\tC',
        }
      },
    })

    expect(calls).toEqual([
      {
        filePaths: ['a.ts', 'b.ts'],
        ranges: [{ path: 'c.ts', startLine: 2, endLine: 2 }],
      },
    ])
    expect(result.results.map((item) => item.path)).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
    ])
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
      rangeHash: `sha256:${startLine}`,
      readCapability: `cap.${startLine}`,
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
})
