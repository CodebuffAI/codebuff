#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const targets = {
  'linux-x64': { bunTarget: 'bun-linux-x64', triplet: 'x86_64-unknown-linux-gnu' },
  'linux-arm64': { bunTarget: 'bun-linux-arm64', triplet: 'aarch64-unknown-linux-gnu' },
  'darwin-x64': { bunTarget: 'bun-darwin-x64', triplet: 'x86_64-apple-darwin' },
  'darwin-arm64': { bunTarget: 'bun-darwin-arm64', triplet: 'aarch64-apple-darwin' },
  'win32-x64': { bunTarget: 'bun-windows-x64', triplet: 'x86_64-pc-windows-msvc' }
}

const platformKey = `${process.platform}-${process.arch}`
const currentTarget = targets[platformKey]

if (!currentTarget) {
  console.error(`Unsupported platform: ${platformKey}`)
  process.exit(1)
}

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

const outputFile = process.platform === 'win32' 
  ? path.join(binDir, 'codebuff.exe')
  : path.join(binDir, 'codebuff')

console.log(`Building binary for ${currentTarget.bunTarget} (${currentTarget.triplet})...`)

try {
  const defineFlag = `--define:PLATFORM_TRIPLET='"${currentTarget.triplet}"'`
  execSync(`bun build dist/index.js --compile --target=${currentTarget.bunTarget} --minify ${defineFlag} --outfile="${outputFile}"`, {
    stdio: 'inherit'
  })
  
  // Make executable on Unix systems
  if (process.platform !== 'win32') {
    fs.chmodSync(outputFile, 0o755)
  }
  
  console.log(`✅ Binary built: ${outputFile}`)
} catch (error) {
  console.error('❌ Build failed:', error.message)
  process.exit(1)
}
