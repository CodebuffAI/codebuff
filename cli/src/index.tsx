#!/usr/bin/env node

const cliEntryPoint =
  (typeof Bun !== 'undefined' && typeof Bun.main === 'string' && Bun.main) ||
  (typeof process !== 'undefined' &&
    Array.isArray(process.argv) &&
    process.argv[1]) ||
  ''

if (cliEntryPoint && typeof globalThis !== 'undefined') {
  const globalScope = globalThis as Record<string, unknown>
  if (!('__CLI_ENTRY_POINT' in globalScope)) {
    Object.defineProperty(globalScope, '__CLI_ENTRY_POINT', {
      value: cliEntryPoint,
      enumerable: false,
      writable: false,
      configurable: false,
    })
  }
}

import './polyfills/bun-strip-ansi'
import { createRequire } from 'module'
import { promises as fs } from 'fs'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getProjectFileTree } from '@codebuff/common/project-file-tree'
import type { FileTreeNode } from '@codebuff/common/util/file'
import { validateAgents } from '@codebuff/sdk'
import { render } from '@opentui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Command } from 'commander'
import React from 'react'

import { App } from './app'
import { getUserCredentials } from './utils/auth'
import { loadAgentDefinitions } from './utils/load-agent-definitions'
import { getLoadedAgentsData } from './utils/local-agent-registry'
import { clearLogFile, logger } from './utils/logger'
import { initializeThemeStore } from './hooks/use-theme'
import { getProjectRoot } from './project-files'

const require = createRequire(import.meta.url)

const INTERNAL_OSC_FLAG = '--internal-osc-detect'
const OSC_DEBUG_ENABLED = process.env.CODEBUFF_OSC_DEBUG === '1'

function logOscDebug(message: string, data?: Record<string, unknown>) {
  if (!OSC_DEBUG_ENABLED) return
  const payload = data ? ` ${JSON.stringify(data)}` : ''
  console.error(`[osc:subprocess] ${message}${payload}`)
}

function isOscDetectionRun(): boolean {
  return process.argv.includes(INTERNAL_OSC_FLAG)
}

async function runOscDetectionSubprocess(): Promise<void> {
  // Set env vars to keep subprocess quiet
  process.env.__INTERNAL_OSC_DETECT = '1'
  process.env.CODEBUFF_GITHUB_ACTIONS = 'true'
  if (process.env.CODEBUFF_OSC_DEBUG === undefined) {
    process.env.CODEBUFF_OSC_DEBUG = '1'
  }
  logOscDebug('Starting OSC detection flag run')

  // Avoid importing logger or other modules that produce output
  const { detectTerminalTheme, terminalSupportsOSC } = await import(
    './utils/terminal-color-detection'
  )

  const oscSupported = terminalSupportsOSC()
  logOscDebug('terminalSupportsOSC result', { oscSupported })

  if (!oscSupported) {
    logOscDebug('Terminal does not support OSC queries, returning null theme')
    console.log(JSON.stringify({ theme: null }))
    await new Promise((resolve) => setImmediate(resolve))
    process.exit(0)
  }

  try {
    const theme = await detectTerminalTheme()
    logOscDebug('detectTerminalTheme resolved', { theme })
    console.log(JSON.stringify({ theme }))
    await new Promise((resolve) => setImmediate(resolve))
  } catch (error) {
    logOscDebug('detectTerminalTheme threw', {
      error: error instanceof Error ? error.message : String(error),
    })
    console.log(JSON.stringify({ theme: null }))
    await new Promise((resolve) => setImmediate(resolve))
  }

  process.exit(0)
}

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

function createQueryClient(): QueryClient {
  return new QueryClient({
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
}

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

async function bootstrapCli(): Promise<void> {
  const { initialPrompt, agent, clearLogs } = parseArgs()

  initializeThemeStore()

  if (clearLogs) {
    clearLogFile()
  }

  const loadedAgentsData = getLoadedAgentsData()

  let validationErrors: Array<{ id: string; message: string }> = []
  if (loadedAgentsData) {
    const agentDefinitions = loadAgentDefinitions()
    const validationResult = await validateAgents(agentDefinitions, {
      remote: true,
    })

    if (!validationResult.success) {
      validationErrors = validationResult.validationErrors
    }
  }

  const queryClient = createQueryClient()

  const AppWithAsyncAuth = () => {
    const [requireAuth, setRequireAuth] = React.useState<boolean | null>(null)
    const [hasInvalidCredentials, setHasInvalidCredentials] =
      React.useState(false)
    const [fileTree, setFileTree] = React.useState<FileTreeNode[]>([])

    React.useEffect(() => {
      const userCredentials = getUserCredentials()
      const apiKey =
        userCredentials?.authToken || process.env[API_KEY_ENV_VAR] || ''

      if (!apiKey) {
        setRequireAuth(true)
        setHasInvalidCredentials(false)
        return
      }

      setHasInvalidCredentials(true)
      setRequireAuth(false)
    }, [])

    React.useEffect(() => {
      const loadFileTree = async () => {
        try {
          const projectRoot = getProjectRoot()
          if (projectRoot) {
            const tree = await getProjectFileTree({
              projectRoot,
              fs: fs,
            })
            logger.info({ tree }, 'Loaded file tree')
            setFileTree(tree)
          }
        } catch (error) {
          // Silently fail - fileTree is optional for @ menu
        }
      }

      loadFileTree()
    }, [])

    return (
      <App
        initialPrompt={initialPrompt}
        agentId={agent}
        requireAuth={requireAuth}
        hasInvalidCredentials={hasInvalidCredentials}
        loadedAgentsData={loadedAgentsData}
        validationErrors={validationErrors}
        fileTree={fileTree}
      />
    )
  }

  render(
    <QueryClientProvider client={queryClient}>
      <AppWithAsyncAuth />
    </QueryClientProvider>,
    {
      backgroundColor: 'transparent',
      exitOnCtrlC: false,
    },
  )
}

async function main(): Promise<void> {
  if (isOscDetectionRun()) {
    await runOscDetectionSubprocess()
    return
  }

  await bootstrapCli()
}

void main()
