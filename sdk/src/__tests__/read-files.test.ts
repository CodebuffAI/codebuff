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
import { editTransactionParams } from '@codebuff/common/tools/params/tool/edit-transaction'

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
    test('reads files well over 100k chars but under 10MB fully without a FILE_TOO_LARGE marker', async () => {
      // The 10MB byte gate is now the single read ceiling, so a file far over
      // the old 100k char cap but under 10MB renders fully.
      const largeContent = 'x'.repeat(300_000)
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

      // Read fully, with no character-limit truncation marker.
      expect(result['large.bin']).toBe(largeContent)
      expect(result['large.bin']).not.toContain('FILE_TOO_LARGE')
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

  describe('explicit ignored-file reads', () => {
    test('reads a project-contained file even when discovery ignores it', async () => {
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

      expect(result['node_modules/package/index.js']).toBe('module code')
    })

    test('does not consult gitignore for explicit reads', async () => {
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

      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('reads a mix of explicitly requested ignored and ordinary files', async () => {
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
      expect(result['node_modules/pkg/index.js']).toBe('dependency')
    })
  })

  describe('explicit read policy', () => {
    test('does not turn gitignore into authorization when no fileFilter is provided', async () => {
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

      expect(result['node_modules/pkg/index.js']).toBe('module code')
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('[SEC-H01] permits an ignored path when the host filter allows it', async () => {
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

      expect(result['node_modules/pkg/index.js']).toBe('module code')
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('allows canonical agent session artifacts through gitignore policy', async () => {
      isFileIgnoredSpy.mockResolvedValue(true)
      const artifactPath = '.agents/sessions/readiness/PLAN.md'
      const mockFs = createMockFs({
        files: {
          [`/project/${artifactPath}`]: { content: '# Plan' },
        },
      })

      const result = await getFiles({
        filePaths: [artifactPath],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result[artifactPath]).toBe('# Plan')
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
    })

    test('allows explicitly requested project agent files despite gitignore', async () => {
      isFileIgnoredSpy.mockResolvedValue(true)
      const privatePath = '.agents/mcp.json'
      const mockFs = createMockFs({
        files: {
          [`/project/${privatePath}`]: { content: '{"secret":"value"}' },
        },
      })

      const result = await getFiles({
        filePaths: [privatePath],
        cwd: '/project',
        fs: mockFs,
      })

      expect(result[privatePath]).toBe('{"secret":"value"}')
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

    test('renders a previously-capped large ranged slice fully under the 10MB read ceiling', async () => {
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

      // A ~100k-char single-line slice is now under the 10MB read ceiling, so
      // it renders fully with a valid rangeHash/readCapability instead of
      // being capped.
      expect(result['src/huge.ts']).toContain(
        '[RANGE_BLOCK lines 1-1 of 1 in src/huge.ts; rangeHash=sha256:',
      )
      expect(result['src/huge.ts']).not.toContain('rangeHash=omitted')
      expect(result['src/huge.ts']).not.toContain('FILE_TOO_LARGE')
      expect(result['src/huge.ts']).toContain(`1\t${hugeLine}`)
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
        editAnchor: {
          startLine: 1,
          endLine: 1,
          contentHash: getContentHash('A=example'),
          readCapability: expect.stringMatching(/^cap\./),
        },
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
        item && 'rangeHash' in item ? item.rangeHash : undefined,
      ).toMatch(/^sha256:/)
      expect(
        item && 'readCapability' in item ? item.readCapability : undefined,
      ).toMatch(/^cap\./)
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

    test('mints wholeFileReadCapability on a proper-subset range from a full-file snapshot when an issuer is supplied', async () => {
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
        expect(item.wholeFileReadCapability).toMatch(/^cap\.v3\./)
        const decoded = decodeReadCapabilityToken(item.wholeFileReadCapability!)
        expect(typeof decoded).toBe('object')
        if (typeof decoded !== 'string') {
          expect(decoded.startLine).toBe(1)
          expect(decoded.endLine).toBe(5)
          expect(decoded.hash).toBe(getContentHash(content))
          expect(
            readCapabilityMatchesScope(decoded, {
              ...capabilityIssuer,
              path: 'src/multi.ts',
            }),
          ).toBe(true)
        }
      }
    })

    test('does not mint wholeFileReadCapability when no capabilityIssuer is supplied', async () => {
      const content = 'line 1\nline 2\nline 3\nline 4\nline 5'
      const mockFs = createMockFs({
        files: { '/project/src/multi.ts': { content } },
      })

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'src/multi.ts', startLine: 2, endLine: 3 }],
        cwd: '/project',
        fs: mockFs,
      })

      const item = result.results[0]
      expect(item?.status).toBe('ok')
      if (item?.status !== 'error' && item.selector === 'range') {
        expect(item.wholeFileReadCapability).toBeUndefined()
      }
    })

    test('does not mint wholeFileReadCapability when the range equals the whole file (requestedProperSubset false)', async () => {
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
        expect(item.wholeFileReadCapability).toBeUndefined()
        // The range capability itself is still minted (its own cap.v3 token spans lines 1-5).
        expect(item.readCapability).toMatch(/^cap\.v3\./)
      }
    })

    test('never mints wholeFileReadCapability for an oversized (large snapshot) range-window read', async () => {
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
        // Security invariant: whole-file capability is only minted from a full
        // file snapshot the model has fully observed. Oversized window reads
        // must NEVER carry one — a future refactor that drops the
        // `snapshot.state === 'full'` guard would let the model authorize edits
        // over content it never saw.
        expect(item.wholeFileReadCapability).toBeUndefined()
        // The bounded range capability itself (cap.v3 over lines 20-21) is still minted.
        expect(item.readCapability).toMatch(/^cap\.v3\./)
      }
    })

    test('mints wholeFileReadCapability for a small range of a large full snapshot under the 10MB read ceiling', async () => {
      const capabilityIssuer = { projectId: '/project', runId: 'run-range-4' }
      // Full-file snapshot far under the 10MB byte gate. Now that the render
      // cap is the 10MB byte gate, the whole file is fully renderable, so the
      // whole-file capability is minted for a proper-subset range read.
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
        // The requested range was fully covered and rendered.
        expect(item.complete).toBe(true)
        // The whole file (~300k chars) is under the 10MB read ceiling, so the
        // full snapshot renders completely and the whole-file capability is
        // minted alongside the bounded range capability.
        expect(item.wholeFileReadCapability).toMatch(/^cap\.v3\./)
        expect(item.readCapability).toMatch(/^cap\.v3\./)
      }
    })

    test('mints wholeFileReadCapability for a large full-snapshot range read under the 10MB read ceiling', async () => {
      const capabilityIssuer = { projectId: '/project', runId: 'run-range-5' }
      // Proper-subset range fully covered by a full-file snapshot whose
      // rendered body far exceeds the old 100k char cap but is under the 10MB
      // byte gate, so it now renders completely.
      const largeContent = Array.from(
        { length: 2_001 },
        (_, index) => `${index + 1}:${'x'.repeat(80)}`,
      ).join('\n')
      const mockFs = createMockFs({
        files: {
          '/project/src/clamped.ts': {
            content: largeContent,
            size: largeContent.length,
          },
        },
      })

      const result = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'src/clamped.ts', startLine: 1, endLine: 2_000 }],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })

      const item = result.results[0]
      expect(item?.status).toBe('ok')
      if (item?.status !== 'error' && item.selector === 'range') {
        // The ~170k-char rendered range is under the 10MB read ceiling, so it
        // renders completely and both the range and whole-file capabilities
        // are minted.
        expect(item.complete).toBe(true)
        expect(item.wholeFileReadCapability).toMatch(/^cap\.v3\./)
        expect(item.readCapability).toMatch(/^cap\.v3\./)
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

  test('fails closed when a legacy path-keyed override mixes a whole file and a range for the same path', async () => {
    const result = await getFilesStructuredFromOverride({
      filePaths: ['mixed.ts'],
      ranges: [{ path: 'mixed.ts', startLine: 1, endLine: 2 }],
      override: async () => ({
        'mixed.ts': 'whole file content that must not leak into the range',
      }),
    })

    expect(result.results).toHaveLength(2)
    // The file selector keeps its own value (a range block value is rejected
    // separately by the isRenderedRangeResult guard); the range selector must
    // fail closed rather than consuming the whole-file content.
    expect(result.results[0]).toMatchObject({
      selector: 'file',
      requestIndex: 0,
      path: 'mixed.ts',
      status: 'ok',
      content: 'whole file content that must not leak into the range',
    })
    expect(result.results[1]).toMatchObject({
      selector: 'range',
      requestIndex: 1,
      path: 'mixed.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
    expect(result.results[1]).not.toHaveProperty('readCapability')
  })

  test('fails closed when an adversarial legacy override key collides with a prototype member name', async () => {
    // Object.prototype members must never be read as file content: the
    // override lookup must be own-enumerable-only. A path named
    // "constructor" or "toString" is not a real key and must yield not_found.
    const result = await getFilesStructuredFromOverride({
      filePaths: ['constructor', 'toString'],
      override: async () => ({
        'a.ts': 'A',
      }),
    })

    expect(result.results).toHaveLength(2)
    for (const [index, path] of ['constructor', 'toString'].entries()) {
      expect(result.results[index]).toMatchObject({
        selector: 'file',
        requestIndex: index,
        path,
        status: 'error',
        error: { code: 'not_found' },
      })
      expect(result.results[index]).not.toHaveProperty('content')
    }
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

  describe('wholeFileReadCapability end-to-end with edit_transaction replace_range', () => {
    // Regression coverage for the reviewer findings about the new
    // whole-file-capability + sub-range replace_range path:
    //   RF-3/12 (read-side end-to-end: read_files range over a trailing-
    //           newline file mints a cap.v3 wholeFileReadCapability whose
    //           endLine is N+1 while visible totalLines is N, and that same
    //           token round-trips through the edit_transaction replace_range
    //           inputSchema transform).
    //   RF-2/11 (schema-level transform coverage: a whole-file cap.v3 paired
    //           with narrower caller startLine/endLine must emit
    //           expectedHash=undefined + wholeFileCapabilityHash=decoded.hash;
    //           a whole-file cap.v3 alone must emit expectedHash=decoded.hash
    //           + bounds from the capability + wholeFileCapabilityHash=undefined).
    //   RF-9/18, RF-8/17 (test coverage for the transform that produces the
    //           wholeFileCapabilityHash field consumed by the runtime
    //           wholeFileCapabilitySubRange preflight branch).
    test('mints a cap.v3 wholeFileReadCapability whose endLine counts the trailing-newline segment, then round-trips through replace_range transform with caller sub-range bounds', async () => {
      const capabilityIssuer = {
        projectId: '/project',
        runId: 'run-e2e-trailing',
      }
      // N=3 visible lines, single trailing newline. splitVisibleLines pops
      // the trailing empty segment so totalLines=3, but the minted
      // wholeFileReadCapability uses the un-popped split and therefore
      // spans lines 1-4 with endLine=N+1=4.
      const content = 'line 1\nline 2\nline 3\n'
      const mockFs = createMockFs({
        files: { '/project/src/trailing.ts': { content } },
      })

      const readResult = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'src/trailing.ts', startLine: 2, endLine: 2 }],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })

      const rangeItem = readResult.results[0]
      if (rangeItem?.status === 'error' || rangeItem?.selector !== 'range') {
        throw new Error('expected a successful range result')
      }
      expect(rangeItem.status).toBe('ok')

      // The range read only exposed one visible line, but the whole-file
      // snapshot saw all of it (totalLines=3 visible lines). The wholeFile-
      // ReadCapability is the only field that carries the trailing-newline
      // off-by-one (endLine=N+1=4).
      expect(rangeItem.totalLines).toBe(3)
      expect(rangeItem.wholeFileReadCapability).toMatch(/^cap\.v3\./)

      const wholeFileCap = rangeItem.wholeFileReadCapability!
      const decoded = decodeReadCapabilityToken(wholeFileCap)
      expect(typeof decoded).toBe('object')
      if (typeof decoded === 'string')
        throw new Error('decoded whole-file cap was an error string')
      expect(decoded.startLine).toBe(1)
      // The subtle off-by-one flagged in RF-3/12: whole-file endLine is N+1
      // (4) because it counts the trailing-newline empty segment, while the
      // visible totalLines used by the read-side proper-subset guard is N (3).
      expect(decoded.endLine).toBe(4)
      expect(decoded.hash).toBe(getContentHash(content))
      expect(
        readCapabilityMatchesScope(decoded, {
          ...capabilityIssuer,
          path: 'src/trailing.ts',
        }),
      ).toBe(true)

      // RF-2/11 case 1 + RF-3/12 end-to-end: feed the whole-file capability
      // back through the edit_transaction replace_range inputSchema `.transform`
      // with NARROWER caller bounds. The transform must emit
      // expectedHash=undefined and carry decoded.hash as wholeFileCapabilityHash
      // (the security-critical relaxation consumed by the runtime
      // wholeFileCapabilitySubRange preflight branch), while keeping the
      // caller's narrower startLine/endLine.
      const narrower = editTransactionParams.inputSchema.parse({
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
      const narrowerEdit = (narrower.edits as unknown[])[0] as Record<
        string,
        unknown
      >
      expect(narrowerEdit).toMatchObject({
        type: 'replace_range',
        path: 'src/trailing.ts',
        startLine: 2,
        endLine: 4,
        expectedHash: undefined,
        wholeFileCapabilityHash: decoded.hash,
      })

      // RF-3/12 end-to-end token-verifies-through-transform path: supplying the
      // capability's OWN bounds (1..N+1=4) — matching the minted token — must
      // resolve to a direct (non sub-range) replace_range: expectedHash gets
      // decoded.hash and wholeFileCapabilityHash stays undefined.
      const matchingBounds = editTransactionParams.inputSchema.parse({
        edits: [
          {
            type: 'replace_range',
            path: 'src/trailing.ts',
            readCapability: wholeFileCap,
            startLine: 1,
            endLine: 4,
            newContent: 'line 1\nline 2\nline 3\nline 3b\n',
          },
        ],
      })
      const matchingEdit = (matchingBounds.edits as unknown[])[0] as Record<
        string,
        unknown
      >
      expect(matchingEdit).toMatchObject({
        type: 'replace_range',
        path: 'src/trailing.ts',
        startLine: 1,
        endLine: 4,
        expectedHash: decoded.hash,
        wholeFileCapabilityHash: undefined,
      })
    })

    test('RF-2/11 case 2: a whole-file cap.v3 alone yields expectedHash=decoded.hash, bounds from the capability, and wholeFileCapabilityHash undefined', async () => {
      const capabilityIssuer = {
        projectId: '/project',
        runId: 'run-e2e-cap-only',
      }
      // 4 visible lines, single trailing newline -> whole-file endLine = 5.
      const content = 'line 1\nline 2\nline 3\nline 4\n'
      const mockFs = createMockFs({
        files: { '/project/src/multi-trail.ts': { content } },
      })

      const readResult = await getFilesStructured({
        filePaths: [],
        ranges: [{ path: 'src/multi-trail.ts', startLine: 2, endLine: 3 }],
        cwd: '/project',
        fs: mockFs,
        capabilityIssuer,
      })

      const rangeItem = readResult.results[0]
      if (
        rangeItem?.status !== 'ok' ||
        rangeItem.selector !== 'range' ||
        !rangeItem.wholeFileReadCapability
      ) {
        throw new Error(
          'expected a complete range result with a wholeFileReadCapability',
        )
      }
      const decoded = decodeReadCapabilityToken(
        rangeItem.wholeFileReadCapability,
      )
      if (typeof decoded === 'string') {
        throw new Error('decoded whole-file cap was an error string')
      }
      expect(decoded.startLine).toBe(1)
      expect(decoded.endLine).toBe(5)

      // No caller bounds: transform MUST NOT relax into the sub-range path.
      // It derives bounds from the capability and sets expectedHash=decoded.hash
      // (the ordinary range-replace attestation), leaving wholeFileCapabilityHash
      // undefined so the runtime uses the exact-match preflight branch.
      const parsed = editTransactionParams.inputSchema.parse({
        edits: [
          {
            type: 'replace_range',
            path: 'src/multi-trail.ts',
            readCapability: rangeItem.wholeFileReadCapability,
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
        expectedHash: decoded.hash,
        wholeFileCapabilityHash: undefined,
      })
    })
  })
})
