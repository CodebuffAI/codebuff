import fs from 'fs'
import path from 'path'

import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'

import { toolHandlers } from '../tool-handlers'

const handleGlob = toolHandlers.glob

describe('handleGlob', () => {
  const testDataDir = path.resolve(__dirname, 'glob-test-data')
  const mockGetProjectRoot = mock(() => {
    return path.resolve(__dirname, '../../')
  })

  beforeAll(async () => {
    await mockModule('@codebuff/npm-app/project-files', () => ({
      getProjectRoot: mockGetProjectRoot,
    }))
  })

  beforeEach(async () => {
    const projectRoot = path.resolve(__dirname, '../../')
    mockGetProjectRoot.mockReturnValue(projectRoot)

    // Create test data directory and nested structure
    await fs.promises.mkdir(testDataDir, { recursive: true })
    await fs.promises.mkdir(path.join(testDataDir, 'src'), { recursive: true })
    await fs.promises.mkdir(path.join(testDataDir, 'src', 'components'), {
      recursive: true,
    })
    await fs.promises.mkdir(path.join(testDataDir, 'lib'), { recursive: true })
    await fs.promises.mkdir(path.join(testDataDir, 'docs'), { recursive: true })

    // Create test files
    await fs.promises.writeFile(
      path.join(testDataDir, 'package.json'),
      '{}',
    )
    await fs.promises.writeFile(
      path.join(testDataDir, 'README.md'),
      '# Test',
    )
    await fs.promises.writeFile(
      path.join(testDataDir, 'src', 'index.ts'),
      'export {}',
    )
    await fs.promises.writeFile(
      path.join(testDataDir, 'src', 'utils.ts'),
      'export {}',
    )
    await fs.promises.writeFile(
      path.join(testDataDir, 'src', 'components', 'Button.tsx'),
      'export {}',
    )
    await fs.promises.writeFile(
      path.join(testDataDir, 'src', 'components', 'Input.tsx'),
      'export {}',
    )
    await fs.promises.writeFile(
      path.join(testDataDir, 'lib', 'helper.js'),
      'module.exports = {}',
    )
    await fs.promises.writeFile(
      path.join(testDataDir, 'docs', 'guide.md'),
      '# Guide',
    )
  })

  afterEach(async () => {
    try {
      await fs.promises.rm(testDataDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  afterAll(() => {
    clearMockedModules()
  })

  test('matches all files with **/* pattern without cwd', async () => {
    const parameters = {
      pattern: '**/*',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    // Should match all files in the project (limited to our test structure)
    expect(files.length).toBeGreaterThan(0)
    expect((result[0].value as any).count).toBe(files.length)
  })

  test('matches all files with **/* pattern with cwd', async () => {
    const parameters = {
      pattern: '**/*',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    // Should match all 8 files in our test directory
    expect(files.length).toBe(8)
    expect(files).toContain('src/__tests__/glob-test-data/package.json')
    expect(files).toContain('src/__tests__/glob-test-data/README.md')
    expect(files).toContain('src/__tests__/glob-test-data/src/index.ts')
    expect(files).toContain('src/__tests__/glob-test-data/src/utils.ts')
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Button.tsx',
    )
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Input.tsx',
    )
    expect(files).toContain('src/__tests__/glob-test-data/lib/helper.js')
    expect(files).toContain('src/__tests__/glob-test-data/docs/guide.md')
  })

  test('matches specific extension with *.ts pattern', async () => {
    const parameters = {
      pattern: '*.ts',
      cwd: 'src/__tests__/glob-test-data/src',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(2)
    expect(files).toContain('src/__tests__/glob-test-data/src/index.ts')
    expect(files).toContain('src/__tests__/glob-test-data/src/utils.ts')
    expect(files).not.toContain(
      'src/__tests__/glob-test-data/src/components/Button.tsx',
    )
  })

  test('matches nested files with **/*.tsx pattern', async () => {
    const parameters = {
      pattern: '**/*.tsx',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(2)
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Button.tsx',
    )
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Input.tsx',
    )
  })

  test('matches files in subdirectory with src/**/* pattern', async () => {
    const parameters = {
      pattern: 'src/**/*',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(4)
    expect(files).toContain('src/__tests__/glob-test-data/src/index.ts')
    expect(files).toContain('src/__tests__/glob-test-data/src/utils.ts')
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Button.tsx',
    )
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Input.tsx',
    )
    expect(files).not.toContain('src/__tests__/glob-test-data/lib/helper.js')
  })

  test('matches markdown files with **/*.md pattern', async () => {
    const parameters = {
      pattern: '**/*.md',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(2)
    expect(files).toContain('src/__tests__/glob-test-data/README.md')
    expect(files).toContain('src/__tests__/glob-test-data/docs/guide.md')
  })

  test('matches single file with exact name', async () => {
    const parameters = {
      pattern: 'package.json',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(1)
    expect(files).toContain('src/__tests__/glob-test-data/package.json')
  })

  test('matches no files with non-matching pattern', async () => {
    const parameters = {
      pattern: '*.py',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(0)
    expect((result[0].value as any).message).toContain('Found 0 file(s)')
  })

  test('matches TypeScript files only with **/*.ts pattern', async () => {
    const parameters = {
      pattern: '**/*.ts',
      cwd: 'src/__tests__/glob-test-data/src',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    // Should match only .ts files, not .tsx files
    expect(files.length).toBe(2)
    expect(files).toContain('src/__tests__/glob-test-data/src/index.ts')
    expect(files).toContain('src/__tests__/glob-test-data/src/utils.ts')
    expect(files).not.toContain(
      'src/__tests__/glob-test-data/src/components/Button.tsx',
    )
    expect(files).not.toContain(
      'src/__tests__/glob-test-data/src/components/Input.tsx',
    )
  })

  test('matches files with brace expansion for multiple extensions', async () => {
    const parameters = {
      pattern: '**/*.{ts,js}',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    // Should match all .ts and .js files recursively using brace expansion
    expect(files.length).toBe(3)
    expect(files).toContain('src/__tests__/glob-test-data/src/index.ts')
    expect(files).toContain('src/__tests__/glob-test-data/src/utils.ts')
    expect(files).toContain('src/__tests__/glob-test-data/lib/helper.js')
  })

  test('handles cwd with trailing slash', async () => {
    const parameters = {
      pattern: '**/*',
      cwd: 'src/__tests__/glob-test-data/',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(8)
  })

  test('returns appropriate message in result', async () => {
    const parameters = {
      pattern: '**/*.ts',
      cwd: 'src/__tests__/glob-test-data/src',
    }

    const result = await handleGlob(parameters, 'test-id')

    expect((result[0].value as any).message).toContain('Found 2 file(s)')
    expect((result[0].value as any).message).toContain('**/*.ts')
    expect((result[0].value as any).message).toContain(
      'src/__tests__/glob-test-data/src',
    )
  })

  test('handles pattern matching in nested cwd', async () => {
    const parameters = {
      pattern: '*.tsx',
      cwd: 'src/__tests__/glob-test-data/src/components',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(2)
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Button.tsx',
    )
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Input.tsx',
    )
  })

  test('matches all TypeScript files recursively', async () => {
    const parameters = {
      pattern: '**/*.ts',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(2)
    expect(files).toContain('src/__tests__/glob-test-data/src/index.ts')
    expect(files).toContain('src/__tests__/glob-test-data/src/utils.ts')
  })

  test('matches with brace expansion pattern', async () => {
    const parameters = {
      pattern: '**/*.{ts,tsx}',
      cwd: 'src/__tests__/glob-test-data',
    }

    const result = await handleGlob(parameters, 'test-id')
    const files = (result[0].value as any).files

    expect(files.length).toBe(4)
    expect(files).toContain('src/__tests__/glob-test-data/src/index.ts')
    expect(files).toContain('src/__tests__/glob-test-data/src/utils.ts')
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Button.tsx',
    )
    expect(files).toContain(
      'src/__tests__/glob-test-data/src/components/Input.tsx',
    )
  })
})
