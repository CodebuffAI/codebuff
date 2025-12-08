#!/usr/bin/env bun
/**
 * Comprehensive SDK verification script.
 * Runs all build, typecheck, and compatibility tests in one command.
 *
 * Usage:
 *   bun run verify          # Run full verification
 *   bun run verify --skip-build  # Skip build step (use existing dist)
 */

import { execSync, type ExecSyncOptions } from 'child_process'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'

const sdkRoot = join(import.meta.dirname, '..')
const testDir = join(sdkRoot, 'test')
const distPath = join(sdkRoot, 'dist')

// Test subprojects that use dist copy setup
const DIST_COPY_SUBPROJECTS = [
  'cjs-compatibility',
  'esm-compatibility',
  'ripgrep-bundling',
]

// Test subprojects that use file reference (different setup)
const FILE_REF_SUBPROJECTS = ['tree-sitter-queries']

interface VerifyOptions {
  skipBuild?: boolean
}

function log(message: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📦 ${message}`)
  console.log('='.repeat(60))
}

function step(message: string) {
  console.log(`\n  → ${message}`)
}

function success(message: string) {
  console.log(`  ✅ ${message}`)
}

function run(command: string, options: ExecSyncOptions = {}) {
  execSync(command, { cwd: sdkRoot, stdio: 'inherit', ...options })
}

function removeOldSdk(projectPath: string) {
  const sdkPath = join(projectPath, 'node_modules', '@codebuff', 'sdk')
  if (existsSync(sdkPath)) {
    step(`Removing old SDK at ${sdkPath}`)
    rmSync(sdkPath, { recursive: true, force: true })
  }
}

function cleanAndBuild() {
  log('Step 1: Clean and Build')

  step('Cleaning dist directory...')
  rmSync(distPath, { recursive: true, force: true })

  step('Building SDK...')
  run('bun run build')

  success('Build complete')
}

function typecheck() {
  log('Step 2: TypeScript Check')

  step('Running typecheck on source...')
  run('tsc --noEmit -p .')

  success('TypeScript check passed')
}

function smokeTest() {
  log('Step 3: Smoke Test')

  step('Running dist smoke tests...')
  run('bun run smoke-test-dist.ts')

  success('Smoke test passed')
}

function runDistCopySubproject(projectName: string) {
  const projectPath = join(testDir, projectName)

  if (!existsSync(projectPath)) {
    throw new Error(`Project not found: ${projectPath}`)
  }

  step(`Testing ${projectName}...`)

  // Remove old SDK installation
  removeOldSdk(projectPath)

  // Install dependencies
  execSync('npm install --silent', { cwd: projectPath, stdio: 'inherit' })

  // Run setup (copies dist to node_modules)
  execSync('npm run setup', { cwd: projectPath, stdio: 'inherit' })

  // Run all tests (imports + types)
  execSync('npm run test:all', { cwd: projectPath, stdio: 'inherit' })

  success(`${projectName} passed`)
}

function runFileRefSubproject(projectName: string) {
  const projectPath = join(testDir, projectName)

  if (!existsSync(projectPath)) {
    throw new Error(`Project not found: ${projectPath}`)
  }

  step(`Testing ${projectName}...`)

  // Install dependencies (uses file: reference)
  execSync('npm install --silent', { cwd: projectPath, stdio: 'inherit' })

  // Run all tests
  execSync('npm run test:all', { cwd: projectPath, stdio: 'inherit' })

  success(`${projectName} passed`)
}

function compatibilityTests() {
  log('Step 4: Compatibility Tests')

  // Run dist-copy subprojects (CJS, ESM, ripgrep)
  for (const project of DIST_COPY_SUBPROJECTS) {
    runDistCopySubproject(project)
  }

  // Run file-reference subprojects (tree-sitter-queries)
  for (const project of FILE_REF_SUBPROJECTS) {
    runFileRefSubproject(project)
  }

  success('All compatibility tests passed')
}

function parseArgs(): VerifyOptions {
  const args = process.argv.slice(2)
  return {
    skipBuild: args.includes('--skip-build'),
  }
}

async function main() {
  const options = parseArgs()

  console.log('🔍 SDK Verification Script')
  console.log('==========================')
  console.log('')
  console.log('This script will:')
  console.log('  1. Clean and build the SDK')
  console.log('  2. Run TypeScript checks')
  console.log('  3. Run smoke tests on dist')
  console.log('  4. Run all compatibility tests (CJS, ESM, ripgrep, tree-sitter)')

  if (options.skipBuild) {
    console.log('\n⚠️  Skipping build step (--skip-build flag)')
    if (!existsSync(distPath)) {
      throw new Error('dist directory not found. Run without --skip-build first.')
    }
  }

  const startTime = Date.now()

  // Step 1: Clean and Build
  if (!options.skipBuild) {
    cleanAndBuild()
  }

  // Step 2: TypeScript Check
  typecheck()

  // Step 3: Smoke Test
  smokeTest()

  // Step 4: Compatibility Tests
  compatibilityTests()

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('')
  console.log('='.repeat(60))
  console.log(`🎉 All verification steps passed! (${duration}s)`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('\n❌ Verification failed:', error.message)
  process.exit(1)
})
