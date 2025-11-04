#!/usr/bin/env node
import './polyfills/bun-strip-ansi'
import { createRequire } from 'module'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { render } from '@opentui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Command } from 'commander'
import React from 'react'

import { validateAgents } from '@codebuff/sdk'

import { App } from './chat'
import './state/theme-store' // Initialize theme store and watchers
import { getUserCredentials } from './utils/auth'
import { getLoadedAgentsData } from './utils/local-agent-registry'
import { clearLogFile } from './utils/logger'
import { loadAgentDefinitions } from './utils/load-agent-definitions'

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

const loadedAgentsData = getLoadedAgentsData()

// Validate local agents and capture any errors
let validationErrors: Array<{ id: string; message: string }> = []
if (loadedAgentsData) {
  const agentDefinitions = loadAgentDefinitions()
  const validationResult = await validateAgents(agentDefinitions, {
    remote: true, // Use remote validation to ensure spawnable agents exist
  })

  if (!validationResult.success) {
    validationErrors = validationResult.validationErrors
  }
}

// Create QueryClient instance with CLI-optimized defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - auth tokens don't change frequently
      gcTime: 10 * 60 * 1000, // 10 minutes - keep cached data a bit longer
      retry: false, // Don't retry failed auth queries automatically
      refetchOnWindowFocus: false, // CLI doesn't have window focus
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchOnMount: false, // Don't refetch on every mount
    },
    mutations: {
      retry: 1, // Retry mutations once on failure
    },
  },
})

// Wrapper component to handle async auth check
const AppWithAsyncAuth = () => {
  const [requireAuth, setRequireAuth] = React.useState<boolean | null>(null)
  const [hasInvalidCredentials, setHasInvalidCredentials] =
    React.useState(false)

  React.useEffect(() => {
    // Check authentication asynchronously
    const userCredentials = getUserCredentials()
    const apiKey =
      userCredentials?.authToken || process.env[API_KEY_ENV_VAR] || ''

    if (!apiKey) {
      // No credentials, require auth
      setRequireAuth(true)
      setHasInvalidCredentials(false)
      return
    }

    // We have credentials - require auth but show invalid credentials banner until validation succeeds
    setHasInvalidCredentials(true)
    setRequireAuth(false)
  }, [])

  return (
    <App
      initialPrompt={initialPrompt}
      agentId={agent}
      requireAuth={requireAuth}
      hasInvalidCredentials={hasInvalidCredentials}
      loadedAgentsData={loadedAgentsData}
      validationErrors={validationErrors}
    />
  )
}

// Start app immediately with QueryClientProvider
function startApp() {
  render(
    <QueryClientProvider client={queryClient}>
      <AppWithAsyncAuth />
    </QueryClientProvider>,
    {
      backgroundColor: 'transparent',
    },
  )
}

startApp()
