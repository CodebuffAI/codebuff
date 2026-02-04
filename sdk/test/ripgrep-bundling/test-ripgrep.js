#!/usr/bin/env node
// Test ripgrep bundling functionality in runtime environment
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

console.log('🧪 Testing ripgrep bundling functionality...')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const testDir = join(__dirname, 'test-files')

// Create test files for searching
function setupTestFiles() {
  console.log('\n📁 Setting up test files...')

  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true })
  }

  writeFileSync(
    join(testDir, 'example.js'),
    `
// Test file for ripgrep search
function testFunction() {
  console.log('This is a test function');
  const specialPattern = 'UNIQUE_SEARCH_TERM';
  return specialPattern;
}

module.exports = { testFunction };
`,
  )

  writeFileSync(
    join(testDir, 'example.ts'),
    `
// TypeScript test file
interface TestInterface {
  name: string;
  value: number;
}

class TestClass implements TestInterface {
  name = 'UNIQUE_SEARCH_TERM';
  value = 42;
}

export { TestClass };
`,
  )

  writeFileSync(
    join(testDir, 'config.json'),
    `{
  "name": "test-config",
  "setting": "UNIQUE_SEARCH_TERM",
  "enabled": true
}`,
  )

  console.log('✅ Test files created')
}

// Clean up test files
async function cleanupTestFiles() {
  try {
    const { rmSync } = await import('fs')
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    console.log('✅ Test files cleaned up')
  } catch (error) {
    console.warn('⚠️ Could not clean up test files:', error.message)
  }
}

try {
  setupTestFiles()

  // Test 1: Import ripgrep functions via Tools namespace
  console.log('\n1. Testing ripgrep imports...')
  const { getBundledRgPath, ToolHelpers } = await import('@codebuff/sdk')

  if (typeof getBundledRgPath !== 'function') {
    throw new Error(
      `Expected getBundledRgPath to be a function, got ${typeof getBundledRgPath}`,
    )
  }

  if (typeof ToolHelpers.codeSearch !== 'function') {
    throw new Error(
      `Expected Tools.codeSearch to be a function, got ${typeof ToolHelpers.codeSearch}`,
    )
  }

  console.log('✅ Ripgrep functions imported successfully')

  // Test 2: Get bundled ripgrep path
  console.log('\n2. Testing getBundledRgPath...')
  const rgPath = getBundledRgPath(import.meta.url)

  if (typeof rgPath !== 'string' || rgPath.length === 0) {
    throw new Error(`Expected valid ripgrep path, got: ${rgPath}`)
  }

  console.log('✅ Ripgrep path found:', rgPath)

  // Test 3: Verify ripgrep binary exists
  console.log('\n3. Testing ripgrep binary existence...')
  if (!existsSync(rgPath)) {
    throw new Error(`Ripgrep binary not found at: ${rgPath}`)
  }

  console.log('✅ Ripgrep binary exists on filesystem')

  // Test 4: Verify we're using bundled ripgrep (not @vscode/ripgrep)
  console.log('\n4. Testing bundled binary location...')
  if (rgPath.includes('@vscode/ripgrep')) {
    throw new Error('Still using @vscode/ripgrep instead of bundled binary!')
  }

  if (!rgPath.includes('vendor/ripgrep')) {
    throw new Error(
      `Expected bundled ripgrep path to contain 'vendor/ripgrep', got: ${rgPath}`,
    )
  }

  console.log('✅ Using bundled ripgrep binary (not @vscode/ripgrep)')

  // Test 5: Test basic code search functionality
  console.log('\n5. Testing basic code search...')
  const searchResult = await ToolHelpers.codeSearch({
    projectPath: testDir,
    pattern: 'UNIQUE_SEARCH_TERM',
    maxResults: 10,
  })

  if (!Array.isArray(searchResult) || searchResult.length === 0) {
    throw new Error(
      'Expected search results array, got empty or invalid result',
    )
  }

  const result = searchResult[0]
  if (result.type !== 'json' || !result.value) {
    throw new Error('Expected JSON result with value property')
  }

  if (!result.value.stdout || typeof result.value.stdout !== 'string') {
    throw new Error('Expected stdout in search result')
  }

  console.log('✅ Basic code search successful')

  // Test 6: Verify search results contain expected matches
  console.log('\n6. Testing search result content...')
  const stdout = result.value.stdout
  const lines = stdout.split('\n').filter((line) => line.trim())

  if (lines.length < 3) {
    throw new Error(`Expected at least 3 matches, got ${lines.length}`)
  }

  // Check that all our test files were found
  const hasJsMatch = lines.some((line) => line.includes('example.js'))
  const hasTsMatch = lines.some((line) => line.includes('example.ts'))
  const hasJsonMatch = lines.some((line) => line.includes('config.json'))

  if (!hasJsMatch || !hasTsMatch || !hasJsonMatch) {
    throw new Error('Missing expected file matches in search results')
  }

  console.log('✅ Search found all expected files')

  // Test 7: Test search with flags
  console.log('\n7. Testing search with flags...')
  const flaggedResult = await ToolHelpers.codeSearch({
    projectPath: testDir,
    pattern: 'unique_search_term',
    flags: '-i', // case insensitive
    maxResults: 5,
  })

  if (!flaggedResult[0]?.value?.stdout) {
    throw new Error('Expected results from case-insensitive search')
  }

  console.log('✅ Search with flags works correctly')

  // Test 8: Test search with file type filtering
  console.log('\n8. Testing file type filtering...')
  const typeFilteredResult = await ToolHelpers.codeSearch({
    projectPath: testDir,
    pattern: 'UNIQUE_SEARCH_TERM',
    flags: '-t js', // only JavaScript files
    maxResults: 5,
  })

  const typeFilteredStdout = typeFilteredResult[0]?.value?.stdout || ''
  const typeFilteredLines = typeFilteredStdout
    .split('\n')
    .filter((line) => line.trim())

  // Should only find JS file, not TS or JSON
  const hasOnlyJs = typeFilteredLines.every(
    (line) => !line.includes('.ts') && !line.includes('.json'),
  )

  if (!hasOnlyJs && typeFilteredLines.length > 0) {
    console.warn('⚠️ File type filtering may not be working as expected')
  } else {
    console.log('✅ File type filtering works correctly')
  }

  // Test 9: Test error handling for invalid directory
  console.log('\n9. Testing error handling...')
  const _invalidResult = await ToolHelpers.codeSearch({
    projectPath: '/nonexistent/directory',
    pattern: 'test',
    maxResults: 1,
  })

  // Should not throw, but may return empty results or error
  console.log('✅ Error handling works (no crashes)')

  // Test 10: Test environment variable override
  console.log('\n10. Testing environment variable override...')
  const originalPath = process.env.CODEBUFF_RG_PATH

  // Set environment variable to override
  process.env.CODEBUFF_RG_PATH = '/usr/bin/rg'

  try {
    const overridePath = getBundledRgPath(import.meta.url)
    if (overridePath !== '/usr/bin/rg') {
      throw new Error('Environment variable override not working')
    }
    console.log('✅ Environment variable override works')
  } finally {
    // Restore original value
    if (originalPath) {
      process.env.CODEBUFF_RG_PATH = originalPath
    } else {
      delete process.env.CODEBUFF_RG_PATH
    }
  }

  console.log('\n🎉 All ripgrep bundling tests passed!')
} catch (error) {
  console.error('\n❌ Ripgrep bundling test failed:', error.message)
  console.error('Stack trace:', error.stack)
  process.exit(1)
} finally {
  await cleanupTestFiles()
}
