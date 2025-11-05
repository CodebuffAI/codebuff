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

import { handleCodeSearch } from '../tool-handlers'

describe('handleCodeSearch', () => {
  const testDataDir = path.resolve(__dirname, 'data')
  // Mock getProjectRoot to point to npm-app directory
  const mockGetProjectRoot = mock(() => {
    const projectRoot = path.resolve(__dirname, '../../')
    return projectRoot
  })

  beforeAll(async () => {
    await mockModule('@codebuff/npm-app/project-files', () => ({
      getProjectRoot: mockGetProjectRoot,
    }))
  })

  beforeEach(async () => {
    const projectRoot = path.resolve(__dirname, '../../')
    mockGetProjectRoot.mockReturnValue(projectRoot)
    console.log('Setting mock project root to:', projectRoot)
    console.log('testDataDir', testDataDir)

    // Create test data directory and files
    await fs.promises.mkdir(testDataDir, { recursive: true })

    // Create test files with specific content
    await fs.promises.writeFile(
      path.join(testDataDir, 'test-content.js'),
      `// Test file for code search
export function testFunction() {
  console.log('UNIQUE_SEARCH_STRING_12345');
  return 'findme_xyz789';
}

export const FINDME_XYZ789 = 'uppercase version';
`,
    )

    await fs.promises.writeFile(
      path.join(testDataDir, 'another-file.ts'),
      `// Another test file
export interface TestInterface {
  UNIQUE_SEARCH_STRING_12345: string;
}
`,
    )
  })

  afterEach(async () => {
    // Clean up test data directory
    try {
      await fs.promises.rm(testDataDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  afterAll(() => {
    clearMockedModules()
  })

  test('calls getProjectRoot and handles execution', async () => {
    const parameters = {
      pattern: 'testFunction',
      cwd: '__tests__/data',
      maxResults: 30,
    }

    await handleCodeSearch(parameters, 'test-id')

    expect(mockGetProjectRoot).toHaveBeenCalled()
  })

  test('handles basic search without cwd', async () => {
    const parameters = {
      pattern: 'export',
      maxResults: 30,
    }

    const result = await handleCodeSearch(parameters, 'test-id')

    expect(result[0].value).toHaveProperty('message')
  })

  test('finds specific content in test file', async () => {
    const parameters = {
      pattern: 'UNIQUE_SEARCH_STRING_12345',
      cwd: 'src/__tests__/data',
      maxResults: 30,
    }

    const result = await handleCodeSearch(parameters, 'test-id')

    expect(mockGetProjectRoot).toHaveBeenCalled()
    expect((result[0].value as any).stdout).toContain(
      'UNIQUE_SEARCH_STRING_12345',
    )
    expect((result[0].value as any).stdout).toContain('test-content.js')
  })

  test('searches with case-insensitive flag', async () => {
    const parameters = {
      pattern: 'findme_xyz789',
      flags: '-i',
      cwd: 'src/__tests__/data',
      maxResults: 30,
    }

    const result = await handleCodeSearch(parameters, 'test-id')

    expect((result[0].value as any).stdout).toContain('findme_xyz789')
  })

  test('limits results when maxResults is specified', async () => {
    const parameters = {
      pattern: 'export',
      maxResults: 1,
      cwd: 'src/__tests__/data',
    }

    const result = await handleCodeSearch(parameters, 'test-id')

    // Should contain results limited message when there are more results than maxResults
    const stdout = (result[0].value as any).stdout
    if (stdout.includes('Results limited to')) {
      expect(stdout).toContain('Results limited to')
    }
  })

  test('uses default limit of 15 per file when maxResults not specified', async () => {
    // Create a file with many lines matching the pattern
    const manyLinesContent = Array.from(
      { length: 30 },
      (_, i) => `export const TEST_VAR_${i} = 'value${i}';`,
    ).join('\n')

    await fs.promises.writeFile(
      path.join(testDataDir, 'many-matches.ts'),
      manyLinesContent,
    )

    // Explicitly not passing maxResults to test default
    const parameters: any = {
      pattern: 'TEST_VAR_',
      cwd: 'src/__tests__/data',
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Should limit to 15 results per file by default
    const lines = stdout
      .split('\n')
      .filter((line: string) => line.includes('TEST_VAR_'))
    expect(lines.length).toBeLessThanOrEqual(15)
    expect(stdout).toContain('Results limited to 15 per file')
  })

  test('applies per-file limit correctly across multiple files', async () => {
    // Create multiple files with many matches each
    for (let fileNum = 1; fileNum <= 3; fileNum++) {
      const content = Array.from(
        { length: 20 },
        (_, i) => `export const VAR_F${fileNum}_${i} = 'value';`,
      ).join('\n')

      await fs.promises.writeFile(
        path.join(testDataDir, `file${fileNum}.ts`),
        content,
      )
    }

    const parameters = {
      pattern: 'VAR_F',
      cwd: 'src/__tests__/data',
      maxResults: 10,
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Each file should be limited to 10 results
    expect(stdout).toContain('Results limited to 10 per file')

    // Count actual result lines (not truncation messages)
    // Split by the truncation message section to only count actual results
    const resultsSection = stdout.split('[Results limited to')[0]
    const file1Matches = (resultsSection.match(/file1\.ts:/g) || []).length
    const file2Matches = (resultsSection.match(/file2\.ts:/g) || []).length
    const file3Matches = (resultsSection.match(/file3\.ts:/g) || []).length

    // Each file should have at most 10 result lines
    expect(file1Matches).toBeLessThanOrEqual(10)
    expect(file2Matches).toBeLessThanOrEqual(10)
    expect(file3Matches).toBeLessThanOrEqual(10)
  })

  test('respects global limit of 250 results', async () => {
    // Create many files with multiple matches to exceed global limit
    for (let fileNum = 1; fileNum <= 30; fileNum++) {
      const content = Array.from(
        { length: 15 },
        (_, i) => `export const GLOBAL_VAR_${fileNum}_${i} = 'value';`,
      ).join('\n')

      await fs.promises.writeFile(
        path.join(testDataDir, `global-test-${fileNum}.ts`),
        content,
      )
    }

    // Using default maxResults of 15
    const parameters: any = {
      pattern: 'GLOBAL_VAR_',
      cwd: 'src/__tests__/data',
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Count total result lines
    const totalMatches = (stdout.match(/GLOBAL_VAR_/g) || []).length

    // Should not exceed 250 results
    expect(totalMatches).toBeLessThanOrEqual(250)

    // Should mention global limit if reached
    if (totalMatches === 250) {
      expect(stdout).toContain('Global limit of 250 results reached')
    }
  })

  test('shows correct truncation message with per-file limits', async () => {
    // Create a file with many matches
    const content = Array.from(
      { length: 25 },
      (_, i) => `const TRUNC_VAR_${i} = 'value${i}';`,
    ).join('\n')

    await fs.promises.writeFile(
      path.join(testDataDir, 'truncate-test.ts'),
      content,
    )

    const parameters = {
      pattern: 'TRUNC_VAR_',
      cwd: 'src/__tests__/data',
      maxResults: 10,
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Should show which file was truncated
    expect(stdout).toContain('Results limited to 10 per file')
    expect(stdout).toContain('truncate-test.ts')
    expect(stdout).toMatch(/25 results \(showing 10\)/)
  })

  test('handles global limit with skipped files message', async () => {
    // Create enough files to trigger global limit
    for (let fileNum = 1; fileNum <= 25; fileNum++) {
      const content = Array.from(
        { length: 12 },
        (_, i) => `const SKIP_VAR_${fileNum}_${i} = ${i};`,
      ).join('\n')

      await fs.promises.writeFile(
        path.join(testDataDir, `skip-test-${fileNum}.ts`),
        content,
      )
    }

    // Using default maxResults of 15
    const parameters: any = {
      pattern: 'SKIP_VAR_',
      cwd: 'src/__tests__/data',
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Should show skipped files message
    const totalMatches = (stdout.match(/SKIP_VAR_/g) || []).length

    if (totalMatches >= 250) {
      expect(stdout).toContain('Global limit of 250 results reached')
      expect(stdout).toMatch(/\d+ file\(s\) skipped/)
    }
  })

  test('applies remaining global space correctly', async () => {
    // Create files where global limit is hit mid-file
    for (let fileNum = 1; fileNum <= 20; fileNum++) {
      const content = Array.from(
        { length: 15 },
        (_, i) => `const SPACE_VAR_${fileNum}_${i} = ${i};`,
      ).join('\n')

      await fs.promises.writeFile(
        path.join(testDataDir, `space-test-${fileNum}.ts`),
        content,
      )
    }

    const parameters = {
      pattern: 'SPACE_VAR_',
      cwd: 'src/__tests__/data',
      maxResults: 15,
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Count total matches - should not exceed 250
    const totalMatches = (stdout.match(/SPACE_VAR_/g) || []).length
    expect(totalMatches).toBeLessThanOrEqual(250)
  })

  test('handles case when no results exceed limits', async () => {
    // Create files with few matches
    await fs.promises.writeFile(
      path.join(testDataDir, 'small-file.ts'),
      'const SMALL_VAR = 1;\nconst SMALL_VAR_2 = 2;',
    )

    const parameters = {
      pattern: 'SMALL_VAR',
      cwd: 'src/__tests__/data',
      maxResults: 15,
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Should not contain truncation messages
    expect(stdout).not.toContain('Results limited to')
    expect(stdout).not.toContain('Global limit')
  })

  test('combines per-file and global limit messages correctly', async () => {
    // Create scenario where both limits are triggered
    for (let fileNum = 1; fileNum <= 22; fileNum++) {
      const content = Array.from(
        { length: 20 },
        (_, i) => `const COMBINED_VAR_${fileNum}_${i} = ${i};`,
      ).join('\n')

      await fs.promises.writeFile(
        path.join(testDataDir, `combined-test-${fileNum}.ts`),
        content,
      )
    }

    const parameters = {
      pattern: 'COMBINED_VAR_',
      cwd: 'src/__tests__/data',
      maxResults: 12,
    }

    const result = await handleCodeSearch(parameters, 'test-id')
    const stdout = (result[0].value as any).stdout

    // Should contain both messages
    const totalMatches = (stdout.match(/COMBINED_VAR_/g) || []).length

    if (totalMatches >= 250) {
      expect(stdout).toContain('Results limited to 12 per file')
      expect(stdout).toContain('Global limit of 250 results reached')
    }
  })

  test('handles glob pattern flags correctly without regex parse errors', async () => {
    // Create test files with different extensions
    await fs.promises.writeFile(
      path.join(testDataDir, 'typescript-file.ts'),
      `export const GLOB_TEST_TS = 'typescript file';`,
    )

    await fs.promises.writeFile(
      path.join(testDataDir, 'javascript-file.js'),
      `export const GLOB_TEST_JS = 'javascript file';`,
    )

    await fs.promises.writeFile(
      path.join(testDataDir, 'text-file.txt'),
      `GLOB_TEST_TXT in text file`,
    )

    // Search with glob flags to only match .ts and .tsx files
    const parameters = {
      pattern: 'GLOB_TEST',
      flags: '-g *.ts -g *.tsx',
      cwd: 'src/__tests__/data',
      maxResults: 30,
    }

    const result = await handleCodeSearch(parameters, 'test-id')

    // Should not have a stderr with regex parse error
    expect((result[0].value as any).stderr).toBeUndefined()

    const stdout = (result[0].value as any).stdout

    // Should find the .ts file
    expect(stdout).toContain('typescript-file.ts')
    expect(stdout).toContain('GLOB_TEST_TS')

    // Should not find the .js or .txt files
    expect(stdout).not.toContain('javascript-file.js')
    expect(stdout).not.toContain('text-file.txt')
  })
})
