#!/usr/bin/env bun

import { promises as fs } from 'fs'
import { createRequire } from 'module'
import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getProjectFileTree } from '@codebuff/common/project-file-tree'
import { validateAgents } from '@codebuff/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Command } from 'commander'
import React from 'react'

import { handlePublish } from './commands/publish'
import { App } from './app'
import { initializeApp } from './init/init-app'
import { getProjectRoot } from './project-files'
import { getUserCredentials } from './utils/auth'
import { initAnalytics } from './utils/analytics'
import { loadAgentDefinitions } from './utils/load-agent-definitions'
import { getLoadedAgentsData } from './utils/local-agent-registry'
import { clearLogFile, logger } from './utils/logger'
import { filterNetworkErrors } from './utils/validation-error-helpers'

import type { FileTreeNode } from '@codebuff/common/util/file'

const require = createRequire(import.meta.url)

const INTERNAL_OSC_FLAG = '--internal-osc-detect'

function isOscDetectionRun(): boolean {
  return process.argv.includes(INTERNAL_OSC_FLAG)
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
  continue: boolean
  continueId?: string | null
  cwd?: string
}

function parseArgs(): ParsedArgs {
  const program = new Command()

  program
    .name('codebuff')
    .description('Codebuff CLI - AI-powered coding assistant')
    .version(loadPackageVersion(), '-v, --version', 'Print the CLI version')
    .option(
      '--agent <agent-id>',
      'Specify which agent to use (e.g., "base", "ask", "file-picker")',
    )
    .option('--clear-logs', 'Remove any existing CLI log files before starting')
    .option(
      '--continue [conversation-id]',
      'Continue from a previous conversation (optionally specify a conversation id)',
    )
    .option(
      '--cwd <directory>',
      'Set the working directory (default: current directory)',
    )
    .helpOption('-h, --help', 'Show this help message')
    .argument('[prompt...]', 'Initial prompt to send to the agent')
    .allowExcessArguments(true)
    .parse(process.argv)

  const options = program.opts()
  const args = program.args

  const continueFlag = options.continue

  return {
    initialPrompt: args.length > 0 ? args.join(' ') : null,
    agent: options.agent,
    clearLogs: options.clearLogs || false,
    continue: Boolean(continueFlag),
    continueId:
      typeof continueFlag === 'string' && continueFlag.trim().length > 0
        ? continueFlag.trim()
        : null,
    cwd: options.cwd,
  }
}

async function main(): Promise<void> {
  const {
    initialPrompt,
    agent,
    clearLogs,
    continue: continueChat,
    continueId,
    cwd,
  } = parseArgs()

  await initializeApp({ cwd, isOscDetectionRun: isOscDetectionRun() })

  // Handle publish command before rendering the app
  if (process.argv.includes('publish')) {
    const publishIndex = process.argv.indexOf('publish')
    const agentIds = process.argv.slice(publishIndex + 1)
    await handlePublish(agentIds)
    process.exit(0)
  }

  // Initialize analytics
  try {
    initAnalytics()
  } catch (error) {
    // Analytics initialization is optional - don't fail the app if it errors
    logger.debug(error, 'Failed to initialize analytics')
  }

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
      validationErrors = filterNetworkErrors(validationResult.validationErrors)
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
        continueChat={continueChat}
        continueChatId={continueId ?? undefined}
      />
    )
  }

  const renderer = await createCliRenderer({
    backgroundColor: 'transparent',
    exitOnCtrlC: false,
  })
  createRoot(renderer).render(
    <QueryClientProvider client={queryClient}>
      <AppWithAsyncAuth />
    </QueryClientProvider>,
  )
}

void main()
