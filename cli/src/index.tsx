#!/usr/bin/env node
import './polyfills/bun-strip-ansi'
import { render } from '@opentui/react'
import React from 'react'
import { createRequire } from 'module'

import { App } from './chat'
import { clearLogFile } from './utils/logger'

const require = createRequire(import.meta.url)

function loadPackageVersion(): string {
  if (process.env.CODEBUFF_CLI_VERSION) {
    return process.env.CODEBUFF_CLI_VERSION
  }

  try {
    const pkg = require('../package.json') as { version?: string }
    if (pkg.version) {
      return pkg.version
    }
  } catch {
    // Continue to dev fallback
  }

  return 'dev'
}

const VERSION = loadPackageVersion()

type ParsedArgs = {
  initialPrompt: string | null
  clearLogs: boolean
  showHelp: boolean
  showVersion: boolean
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2)
  let clearLogs = false
  let showHelp = false
  let showVersion = false
  const promptParts: string[] = []

  for (const arg of args) {
    switch (arg) {
      case '--clear-logs':
        clearLogs = true
        break
      case '--help':
      case '-h':
        showHelp = true
        break
      case '--version':
      case '-v':
        showVersion = true
        break
      default:
        promptParts.push(arg)
        break
    }
  }

  return {
    initialPrompt: promptParts.length > 0 ? promptParts.join(' ') : null,
    clearLogs,
    showHelp,
    showVersion,
  }
}

function printHelp() {
  console.log(`Codecane v${VERSION}`)
  console.log('')
  console.log('Usage: codecane [options] [initial prompt]')
  console.log('')
  console.log('Options:')
  console.log('  --help, -h       Show this help message and exit')
  console.log('  --version, -v    Print the CLI version and exit')
  console.log('  --clear-logs     Remove any existing CLI log files before starting')
  console.log('')
  console.log(
    'Provide a prompt after the options to automatically seed the first conversation.',
  )
}

function printVersion() {
  console.log(`Codecane v${VERSION}`)
}

const { initialPrompt, clearLogs, showHelp, showVersion } = parseArgs()

if (showVersion) {
  printVersion()
  process.exit(0)
}

if (showHelp) {
  printHelp()
  process.exit(0)
}

if (clearLogs) {
  clearLogFile()
}

if (initialPrompt) {
  render(<App initialPrompt={initialPrompt} />)
} else {
  render(<App />)
}
