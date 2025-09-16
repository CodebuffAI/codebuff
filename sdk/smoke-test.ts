// Smoke test script to verify CJS build works correctly
// This runs after the build to ensure the artifacts are properly functional

import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const testDir = 'test-smoke'
const testResults: { format: string; success: boolean; error?: string }[] = []

async function runSmokeTests() {
  console.log('🧪 Running SDK smoke tests...')

  // Clean up any previous test directory
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch {}

  mkdirSync(testDir, { recursive: true })

  // Test CJS require
  await testCJSRequire()

  // Clean up
  rmSync(testDir, { recursive: true, force: true })

  // Report results
  console.log('\n📊 Smoke Test Results:')
  testResults.forEach(({ format, success, error }) => {
    const status = success ? '✅' : '❌'
    console.log(`${status} ${format}: ${success ? 'PASS' : 'FAIL'}`)
    if (error) console.log(`   Error: ${error}`)
  })

  const allPassed = testResults.every((r) => r.success)
  if (allPassed) {
    console.log('\n🎉 All smoke tests passed!')
    process.exit(0)
  } else {
    console.log('\n💥 Some smoke tests failed!')
    process.exit(1)
  }
}

async function testCJSRequire() {
  console.log('  Testing CJS require...')

  const testFile = join(testDir, 'test-cjs.cjs')
  const testCode = `
try {
  // Test basic require structure without invoking complex functionality
  const pkg = require('../dist/index.js');
  console.log('CJS require successful');
  
  // Check that it's an object with some exports
  if (typeof pkg === 'object' && pkg !== null) {
    const exportKeys = Object.keys(pkg);
    console.log('Package exports found:', exportKeys.length, 'exports');
    
    // Basic smoke test - just verify structure exists
    if (exportKeys.length > 0) {
      console.log('✅ CJS format has exports');
      process.exit(0);
    } else {
      console.error('❌ No exports found');
      process.exit(1);
    }
  } else {
    console.error('❌ Package is not an object:', typeof pkg);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ CJS require failed:', error.message);
  process.exit(1);
}
`

  writeFileSync(testFile, testCode)

  try {
    execSync(`node ${testFile}`, { stdio: 'pipe', cwd: process.cwd() })
    testResults.push({ format: 'CJS', success: true })
  } catch (error: any) {
    testResults.push({
      format: 'CJS',
      success: false,
      error: error.message || 'Unknown error',
    })
  }
}

if (import.meta.main) {
  runSmokeTests().catch(console.error)
}
