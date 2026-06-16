import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import * as projectFileTree from '@codebuff/common/project-file-tree'
import { createNodeError } from '@codebuff/common/testing/errors'
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import { getFiles } from '../tools/read-files'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { PathLike } from 'node:fs'

// Helper to create a mock filesystem
function createMockFs(config: {
  files?: Record<string, { content: string; size?: number }>
  errors?: Record<string, { code?: string; message?: string }>
}): CodebuffFileSystem {
  const { files = {}, errors = {} } = config

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
    writeFile: async () => undefined,
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
      expect(result['large.bin']).toContain('Do not edit from this truncated content')
      expect(result['large.bin']).toContain('Large-file edits require basedOnRead')
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

    test('should NOT check gitignore when fileFilter is provided (caller owns filtering)', async () => {
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

      // File should be read since caller's filter allowed it
      expect(result['node_modules/pkg/index.js']).toBe('module code')
      // isFileIgnored should NOT have been called since caller provided a filter
      expect(isFileIgnoredSpy).not.toHaveBeenCalled()
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
        /^\[Lines 3-5 of 10 in src\/big\.ts; rangeHash=sha256:[a-f0-9]{64}; readCapability=cap\.[A-Za-z0-9_-]+\]\n\[Copy-safe str_replace replacement template:\n  \{\n    oldString: <copy exact text from the range body below>,\n    newString: <replacement text>,\n    allowMultiple: false,\n    basedOnRead: "cap\.[A-Za-z0-9_-]+",\n  \}\n\]\nline 3\nline 4\nline 5$/,
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
        /^\[Lines 1-10 of 10 in src\/big\.ts; rangeHash=sha256:[a-f0-9]{64}; readCapability=cap\.[A-Za-z0-9_-]+\]/,
      )
      expect(result['src/big.ts']).toContain(multiLine)
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

      expect(result['src/big.ts']).toContain('[Lines 8-10 of 10 in src/big.ts; rangeHash=sha256:')
      expect(result['src/big.ts']).toContain('Copy-safe str_replace replacement template')
      expect(result['src/big.ts']).toContain('line 8\nline 9\nline 10')
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

      expect(result['src/big.ts']).toContain('but file has only 10 lines')
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

      expect(result['src/big.ts']).toContain('[Lines 1-2 of 10 in src/big.ts; rangeHash=sha256:')
      expect(result['src/big.ts']).toContain('Copy-safe str_replace replacement template')
      expect(result['src/big.ts']).toContain('line 1\nline 2')
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
      expect(result['src/big.ts']).toContain('[Lines 1-2 of 10 in src/big.ts')
      expect(result['src/big.ts']).toContain('line 1')
      expect(result['src/big.ts']).toContain('[Lines 8-9 of 10 in src/big.ts')
      expect(result['src/big.ts']).toContain('line 9')
    })

    test('should allow ranged reads for files over the whole-file 100k char truncation threshold', async () => {
      const largeContent = Array.from({ length: 30_000 }, (_, index) =>
        `line ${index + 1}`,
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
        '[Lines 20000-20002 of 30,000 in src/large.ts; rangeHash=sha256:',
      )
      expect(result['src/large.ts']).toContain(
        'Copy-safe str_replace replacement template',
      )
      expect(result['src/large.ts']).toContain(
        'oldString: <copy exact text from the range body below>',
      )
      expect(result['src/large.ts']).toContain('basedOnRead: "cap.')
      expect(result['src/large.ts']).toContain(
        'line 20000\nline 20001\nline 20002',
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

      expect(result['src/huge.ts']).toMatch(
        /^\[Lines 1-1 of 1 in src\/huge\.ts; rangeHash=sha256:[a-f0-9]{64}; readCapability=cap\.[A-Za-z0-9_-]+\]/,
      )
      expect(result['src/huge.ts']).toContain('FILE_TOO_LARGE')
      expect(result['src/huge.ts']).toContain('do not edit from this truncated range')
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
    test('should convert absolute paths within project to relative paths', async () => {
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

      expect(result['src/index.ts']).toBe('content')
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
})
