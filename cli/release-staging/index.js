#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const packageName = 'codecane'

// Binary is stored in the package's bin/ directory
const binaryName =
  process.platform === 'win32' ? `${packageName}.exe` : packageName
const binaryPath = path.join(__dirname, 'bin', binaryName)

function main() {
  console.log('\x1b[1m\x1b[91m' + '='.repeat(60) + '\x1b[0m')
  console.log('\x1b[1m\x1b[93m❄️ CODECANE STAGING ENVIRONMENT ❄️\x1b[0m')
  console.log(
    '\x1b[1m\x1b[91mFOR TESTING PURPOSES ONLY - NOT FOR PRODUCTION USE\x1b[0m',
  )
  console.log('\x1b[1m\x1b[91m' + '='.repeat(60) + '\x1b[0m')
  console.log('')

  // Verify binary exists
  if (!fs.existsSync(binaryPath)) {
    console.error(
      `❌ Binary not found at ${binaryPath}. This package may be corrupted.`,
    )
    console.error('Please try reinstalling: npm install -g codecane')
    process.exit(1)
  }

  // Execute the binary with all arguments passed through
  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: 'inherit',
  })

  child.on('exit', (code) => {
    process.exit(code || 0)
  })

  child.on('error', (error) => {
    console.error('❌ Failed to start codecane:', error.message)
    process.exit(1)
  })
}

main()
