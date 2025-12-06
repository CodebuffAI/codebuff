#!/usr/bin/env bun
/**
 * Script to test SDK types by running setup in each test subproject.
 * Removes the previous node_modules/@codebuff/sdk installation before running setup.
 */

import { execSync } from 'child_process'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'

const TEST_SUBPROJECTS = [
  'cjs-compatibility',
  'esm-compatibility',
  'ripgrep-bundling',
]

const sdkRoot = join(import.meta.dirname, '..')
const testDir = join(sdkRoot, 'test')

function log(message: string) {
  console.log(`\n📦 ${message}`)
}

function removeOldSdk(projectPath: string) {
  const sdkPath = join(projectPath, 'node_modules', '@codebuff', 'sdk')
  if (existsSync(sdkPath)) {
    console.log(`  🗑️  Removing old SDK at ${sdkPath}`)
    rmSync(sdkPath, { recursive: true, force: true })
  }
}

function runSetup(projectName: string) {
  const projectPath = join(testDir, projectName)

  if (!existsSync(projectPath)) {
    console.error(`  ❌ Project not found: ${projectPath}`)
    process.exit(1)
  }

  log(`Setting up ${projectName}...`)

  // Remove old SDK installation
  removeOldSdk(projectPath)

  // Run npm install to ensure dependencies are present
  console.log(`  📥 Installing dependencies...`)
  execSync('npm install --silent', { cwd: projectPath, stdio: 'inherit' })

  // Run the setup script
  console.log(`  🔧 Running setup script...`)
  execSync('npm run setup', { cwd: projectPath, stdio: 'inherit' })

  // Run type tests
  console.log(`  🔍 Running type tests...`)
  execSync('npm run test:types', { cwd: projectPath, stdio: 'inherit' })

  console.log(`  ✅ ${projectName} types passed!`)
}

async function main() {
  console.log('🧪 SDK Type Testing Script')
  console.log('==========================')

  // Ensure the SDK is built first
  log('Checking SDK dist...')
  const distPath = join(sdkRoot, 'dist')
  if (!existsSync(distPath)) {
    console.log('  ⚠️  SDK dist not found, building...')
    execSync('bun run build', { cwd: sdkRoot, stdio: 'inherit' })
  }

  // Run setup and type tests for each subproject
  for (const project of TEST_SUBPROJECTS) {
    runSetup(project)
  }

  console.log('\n🎉 All type tests passed!')
}

main().catch((error) => {
  console.error('\n❌ Type testing failed:', error.message)
  process.exit(1)
})
