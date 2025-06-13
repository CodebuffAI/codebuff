#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const targets = {
  'bun-linux-x64': { output: 'codebuff-linux-x64', triplet: 'x86_64-unknown-linux-gnu' },
  'bun-linux-arm64': { output: 'codebuff-linux-arm64', triplet: 'aarch64-unknown-linux-gnu' },
  'bun-darwin-x64': { output: 'codebuff-darwin-x64', triplet: 'x86_64-apple-darwin' },
  'bun-darwin-arm64': { output: 'codebuff-darwin-arm64', triplet: 'aarch64-apple-darwin' },
  'bun-windows-x64': { output: 'codebuff-win32-x64.exe', triplet: 'x86_64-pc-windows-msvc' }
}

// Get target from environment or build all
const targetToBuild = process.env.BUN_TARGET
const outputName = process.env.OUTPUT_NAME

if (targetToBuild && outputName) {
  // Build single target (for CI)
  const targetInfo = targets[targetToBuild]
  if (!targetInfo) {
    console.error(`Unknown target: ${targetToBuild}`)
    process.exit(1)
  }
  buildTarget(targetToBuild, outputName, targetInfo.triplet)
} else {
  // Build all targets (for local testing)
  console.log('Building all targets...')
  Object.entries(targets).forEach(([target, info]) => {
    buildTarget(target, info.output, info.triplet)
  })
}

function buildTarget(bunTarget, outputName, triplet) {
  // Ensure dist directory exists and is built (use bundle-for-binary that excludes problematic packages)
  if (!fs.existsSync('dist/index.js')) {
    console.log('Building bundle for binary...')
    execSync('bun run bundle-for-binary', { stdio: 'inherit' })
  }

  // Create bin directory
  const binDir = path.join(__dirname, '..', 'bin')
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }

  const outputFile = path.join(binDir, outputName)

  console.log(`Building ${bunTarget} -> ${outputName} (${triplet})...`)

  try {
    const defineFlag = `--define:PLATFORM_TRIPLET='"${triplet}"'`
    // Include worker entrypoints in the compile command
    const workerEntrypoints = [
      'src/workers/project-context.ts',
      'src/workers/checkpoint-worker.ts'
    ].join(' ')
    
    execSync(`bun build --compile dist/index.js ${workerEntrypoints} --target=${bunTarget} --minify ${defineFlag} --outfile="${outputFile}"`, {
      stdio: 'inherit'
    })
    
    console.log(`✅ Built: ${outputFile}`)
  } catch (error) {
    console.error(`❌ Failed to build ${bunTarget}:`, error.message)
    process.exit(1)
  }
}
