#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn, execSync } = require('child_process')

const homeDir = os.homedir()
const manicodeDir = path.join(homeDir, '.config', 'manicode')
const binaryName = process.platform === 'win32' ? 'codebuff.exe' : 'codebuff'
const binaryPath = path.join(manicodeDir, binaryName)

// Check if binary exists
if (!fs.existsSync(binaryPath)) {
  console.log('🔄 Codebuff binary not found. Downloading...')
  
  try {
    // Run the download script synchronously
    const downloadScript = path.join(__dirname, 'download-binary.js')
    execSync(`node "${downloadScript}"`, { stdio: 'inherit' })
  } catch (error) {
    console.error('❌ Failed to download codebuff binary')
    console.error('Please try running: npm install -g codebuff')
    process.exit(1)
  }
}

// Check if binary is executable (Unix only)
if (process.platform !== 'win32') {
  try {
    fs.accessSync(binaryPath, fs.constants.X_OK)
  } catch (error) {
    console.error(`❌ Codebuff binary is not executable: ${binaryPath}`)
    console.error('Please try running: npm install -g codebuff')
    process.exit(1)
  }
}

// Execute the binary with all arguments passed through
const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  cwd: process.cwd()
})

child.on('exit', (code) => {
  process.exit(code || 0)
})
