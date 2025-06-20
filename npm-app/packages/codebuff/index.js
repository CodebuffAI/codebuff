#!/usr/bin/env node

// Runtime loader – picks the platform package that npm just installed.
const { spawn } = require('child_process')

const triples = {
  'linux-x64': 'codebuff-linux-x64',
  'linux-arm64': 'codebuff-linux-arm64',
  'darwin-x64': 'codebuff-darwin-x64',
  'darwin-arm64': 'codebuff-darwin-arm64',
  'win32-x64': 'codebuff-win32-x64'
}

const triplet = `${process.platform}-${process.arch}`
const packageName = triples[triplet]

if (!packageName) {
  console.error(
    `codebuff: unsupported platform (${triplet}). ` +
    `If you're on an exotic CPU/OS, ping us on Discord: https://discord.com/invite/mcWTGjgTj3`
  )
  process.exit(1)
}

try {
  // Try to resolve the platform-specific package
  const binaryName = process.platform === 'win32' ? 'codebuff.exe' : 'codebuff'
  const binaryPath = require.resolve(`${packageName}/${binaryName}`)
  
  // Execute the binary with all arguments passed through
  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
    cwd: process.cwd()
  })

  child.on('exit', (code) => {
    process.exit(code || 0)
  })

  child.on('error', (error) => {
    console.error(`Failed to execute codebuff: ${error.message}`)
    process.exit(1)
  })

} catch (e) {
  console.error(
    `codebuff: platform package not found (${packageName}). ` +
    `This usually means the installation failed. Try reinstalling: npm install -g codebuff`
  )
  process.exit(1)
}
