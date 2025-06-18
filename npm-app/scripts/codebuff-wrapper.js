#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')

const homeDir = os.homedir()
const manicodeDir = path.join(homeDir, '.manicode')
const binaryName = process.platform === 'win32' ? 'codebuff.exe' : 'codebuff'
const binaryPath = path.join(manicodeDir, binaryName)

// Check if binary exists
if (!fs.existsSync(binaryPath)) {
  console.error(`❌ Codebuff binary not found at ${binaryPath}`)
  console.error('Please reinstall codebuff: npm install -g codebuff')
  process.exit(1)
}

// Check if binary is executable (Unix only)
if (process.platform !== 'win32') {
  try {
    fs.accessSync(binaryPath, fs.constants.X_OK)
  } catch (error) {
    console.error(`❌ Codebuff binary is not executable: ${binaryPath}`)
    console.error('Please reinstall codebuff: npm install -g codebuff')
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
