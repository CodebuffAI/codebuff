#!/usr/bin/env node
import './polyfills/bun-strip-ansi'
import { render } from '@opentui/react'
import React from 'react'
import { createRequire } from 'module'
import { Command } from 'commander'
import { getUserInfoFromApiKey } from '@codebuff/sdk'

import { App } from './chat'
import { clearLogFile, logger } from './utils/logger'
import { getUserCredentials } from './utils/auth'

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
  agent?: string
  clearLogs: boolean
}

function parseArgs(): ParsedArgs {
  const program = new Command()

  program
    .name('codecane')
    .description('Codecane CLI - AI-powered coding assistant')
    .version(VERSION, '-v, --version', 'Print the CLI version')
    .option(
      '--agent <agent-id>',
      'Specify which agent to use (e.g., "base", "ask", "file-picker")',
    )
    .option('--clear-logs', 'Remove any existing CLI log files before starting')
    .helpOption('-h, --help', 'Show this help message')
    .argument('[prompt...]', 'Initial prompt to send to the agent')
    .allowExcessArguments(true)
    .parse(process.argv)

  const options = program.opts()
  const args = program.args

  return {
    initialPrompt: args.length > 0 ? args.join(' ') : null,
    agent: options.agent,
    clearLogs: options.clearLogs || false,
  }
}

const { initialPrompt, agent, clearLogs } = parseArgs()

if (clearLogs) {
  clearLogFile()
}

// Check authentication before starting
async function startApp() {
  const userCredentials = getUserCredentials()
  const authResult = await getUserInfoFromApiKey({
    apiKey: userCredentials?.authToken || process.env.CODEBUFF_API_KEY || '',
    fields: ['id'],
    logger,
  })

  render(
    <App
      initialPrompt={initialPrompt}
      agentId={agent}
      requireAuth={!authResult}
      hasInvalidCredentials={!authResult}
    />,
  )
}

startApp()
