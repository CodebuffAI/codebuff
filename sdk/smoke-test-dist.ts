// Smoke test script to verify compiled CJS dist build works correctly with Node.js
// This ensures the actual published artifacts function properly

import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const testDir = 'test-dist-smoke'
const testResults: {
  format: string
  test: string
  success: boolean
  error?: string
}[] = []

// Test TypeScript code sample for tree-sitter functionality
const sampleCode = `
function calculateSum(a: number, b: number): number {
  return a + b;
}

class Calculator {
  private history: number[] = [];
  
  add(x: number, y: number): number {
    const result = calculateSum(x, y);
    this.history.push(result);
    return result;
  }
  
  getHistory(): number[] {
    return this.history;
  }
}

const calc = new Calculator();
const sum = calc.add(5, 3);
console.log('Result:', sum);
`

async function runDistSmokeTests() {
  console.log('🧪 Running SDK dist smoke tests with Node.js...')

  // Clean up any previous test directory
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch {}

  mkdirSync(testDir, { recursive: true })

  // Create package.json and install dependencies for proper Node.js environment
  await setupTestEnvironment()

  // Test CJS dist require
  await testCJSDist()

  // Test CJS tree-sitter functionality
  await testCJSTreeSitter()

  // Clean up
  rmSync(testDir, { recursive: true, force: true })

  // Report results
  console.log('\n📊 Dist Smoke Test Results:')
  testResults.forEach(({ format, test, success, error }) => {
    const status = success ? '✅' : '❌'
    console.log(`${status} ${format} - ${test}: ${success ? 'PASS' : 'FAIL'}`)
    if (error) console.log(`   Error: ${error}`)
  })

  const allPassed = testResults.every((r) => r.success)
  if (allPassed) {
    console.log('\n🎉 All dist smoke tests passed!')
    process.exit(0)
  } else {
    console.log('\n💥 Some dist smoke tests failed!')
    process.exit(1)
  }
}

async function setupTestEnvironment() {
  console.log('  Setting up test environment...')

  // Create a minimal package.json that installs the dependencies the dist needs
  const testPackageJson = {
    name: 'sdk-dist-test',
    version: '1.0.0',
    type: 'commonjs',
    dependencies: {
      'web-tree-sitter': '^0.25.6',
      // Add other dependencies that the built dist files need
    },
  }

  writeFileSync(
    join(testDir, 'package.json'),
    JSON.stringify(testPackageJson, null, 2),
  )

  // Install dependencies
  try {
    execSync('npm install --silent', { cwd: testDir, stdio: 'pipe' })
    console.log('  ✅ Test environment setup complete')
  } catch (error: any) {
    console.error('  ❌ Failed to install test dependencies:', error.message)
    throw error
  }
}

async function testCJSDist() {
  console.log('  Testing CJS dist require with Node.js...')

  const testFile = join(testDir, 'test-cjs-dist.cjs')
  const testCode = `
try {
  // Require from the built CJS dist files
  const pkg = require('../dist/index.cjs');
  console.log('CJS dist require successful');
  
  // Verify basic structure
  if (typeof pkg === 'object' && pkg !== null) {
    const exportKeys = Object.keys(pkg);
    console.log('Package exports found:', exportKeys.length, 'exports');
    
    // Check for expected exports
    const expectedExports = ['SDK_VERSION', 'SDK_NAME', 'getFileTokenScores', 'setWasmDir'];
    const foundExports = expectedExports.filter(exp => exp in pkg);
    
    if (foundExports.length >= 2) {
      console.log('✅ CJS dist has expected exports:', foundExports.join(', '));
      process.exit(0);
    } else {
      console.error('❌ Missing expected exports. Found:', foundExports.join(', '));
      process.exit(1);
    }
  } else {
    console.error('❌ Package is not an object:', typeof pkg);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ CJS dist require failed:', error.message);
  process.exit(1);
}
`

  writeFileSync(testFile, testCode)

  try {
    execSync(`node test-cjs-dist.cjs`, { stdio: 'pipe', cwd: testDir })
    testResults.push({ format: 'CJS', test: 'Basic Require', success: true })
  } catch (error: any) {
    testResults.push({
      format: 'CJS',
      test: 'Basic Require',
      success: false,
      error: error.message || 'Unknown error',
    })
  }
}

async function testCJSTreeSitter() {
  console.log('  Testing CJS dist tree-sitter functionality...')

  const testFile = join(testDir, 'test-cjs-treesitter.cjs')
  const testCode = `
const runTest = async () => {
  try {
    // Require tree-sitter functionality from built CJS dist
    const { getFileTokenScores, setWasmDir } = require('../dist/index.cjs');
    console.log('CJS tree-sitter imports successful');
    
    // Set WASM directory to the correct location for dist tests
    const path = require('path');
    
    // Set WASM directory to the built dist location
    setWasmDir(path.join(process.cwd(), '..', 'dist', 'wasm'));
    console.log('✅ setWasmDir function works');
    
    // Test getFileTokenScores with sample TypeScript code
    const projectFiles = {
      'test.ts': \`${sampleCode.replace(/`/g, '\\`')}\`
    };
    
    const tokenData = await getFileTokenScores(
      process.cwd(),
      ['test.ts'],
      (filePath) => projectFiles[filePath] || null
    );
    
    const { tokenScores } = tokenData;
    
    if (!tokenScores['test.ts']) {
      throw new Error('No token scores found for test.ts');
    }
    
    const tokens = Object.keys(tokenScores['test.ts']);
    console.log(\`✅ Found \${tokens.length} tokens in TypeScript file\`);
    
    // Check for expected tokens
    const expectedTokens = ['calculateSum', 'Calculator', 'add', 'getHistory'];
    const foundTokens = expectedTokens.filter(token => tokens.includes(token));
    
    if (foundTokens.length > 0) {
      console.log(\`✅ Found expected tokens: \${foundTokens.join(', ')}\`);
      process.exit(0);
    } else {
      console.warn('⚠ Warning: No expected tokens found. Found tokens:', tokens.slice(0, 10));
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ CJS tree-sitter test failed:', error.message);
    process.exit(1);
  }
};

runTest();
`

  writeFileSync(testFile, testCode)

  try {
    const result = execSync(`node test-cjs-treesitter.cjs`, {
      stdio: 'pipe',
      cwd: testDir,
      timeout: 30000,
      encoding: 'utf8',
    })
    console.log('CJS TreeSitter test output:', result)
    testResults.push({ format: 'CJS', test: 'Tree-sitter', success: true })
  } catch (error: any) {
    console.log('CJS TreeSitter test stderr:', error.stderr)
    console.log('CJS TreeSitter test stdout:', error.stdout)
    testResults.push({
      format: 'CJS',
      test: 'Tree-sitter',
      success: false,
      error: error.message || 'Unknown error',
    })
  }
}

if (import.meta.main) {
  runDistSmokeTests().catch((error) => {
    console.error('Dist smoke test failed:', error)
    process.exit(1)
  })
}
