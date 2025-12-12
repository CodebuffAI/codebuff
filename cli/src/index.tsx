#!/usr/bin/env bun

import { promises as fs } from 'fs'
import { createRequire } from 'module'

import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getProjectFileTree } from '@codebuff/common/project-file-tree'
import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query'
import { Command } from 'commander'
import { cyan, green, red, yellow } from 'picocolors'
import React from 'react'

import { App } from './app'
import { handlePublish } from './commands/publish'
import { initializeApp } from './init/init-app'
import { getProjectRoot } from './project-files'
import { initAnalytics } from './utils/analytics'
import { getUserCredentials } from './utils/auth'
import { initializeAgentRegistry } from './utils/local-agent-registry'
import { clearLogFile, logger } from './utils/logger'
import { detectTerminalTheme } from './utils/terminal-color-detection'
import { setOscDetectedTheme } from './utils/theme-system'

import type { FileTreeNode } from '@codebuff/common/util/file'
import type { AgentMode } from './utils/constants'

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

// Configure TanStack Query's focusManager for terminal environments
// This is required because there's no browser visibility API in terminal apps
// Without this, refetchInterval won't work because TanStack Query thinks the app is "unfocused"
focusManager.setEventListener(() => {
  // No-op: no event listeners in CLI environment (no window focus/visibility events)
  return () => {}
})
focusManager.setFocused(true)

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
  initialMode?: AgentMode
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
    .option('--lite', 'Start in LITE mode')
    .option('--max', 'Start in MAX mode')
    .option('--plan', 'Start in PLAN mode')
    .helpOption('-h, --help', 'Show this help message')
    .argument('[prompt...]', 'Initial prompt to send to the agent')
    .allowExcessArguments(true)
    .parse(process.argv)

  const options = program.opts()
  const args = program.args

  const continueFlag = options.continue

  // Determine initial mode from flags (last flag wins if multiple specified)
  let initialMode: AgentMode | undefined
  if (options.lite) initialMode = 'LITE'
  if (options.max) initialMode = 'MAX'
  if (options.plan) initialMode = 'PLAN'

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
    initialMode,
  }
}

async function main(): Promise<void> {
  // Run OSC theme detection BEFORE anything else.
  // This MUST happen before OpenTUI starts because OSC responses come through stdin,
  // and OpenTUI also listens to stdin. Running detection here ensures stdin is clean.
  if (process.stdin.isTTY && process.platform !== 'win32') {
    try {
      const oscTheme = await detectTerminalTheme()
      if (oscTheme) {
        setOscDetectedTheme(oscTheme)
      }
    } catch {
      // Silently ignore OSC detection failures
    }
  }

  const {
    initialPrompt,
    agent,
    clearLogs,
    continue: continueChat,
    continueId,
    cwd,
    initialMode,
  } = parseArgs()

  await initializeApp({ cwd })

  // Initialize agent registry (loads user agents via SDK)
  await initializeAgentRegistry()

  // Handle publish command before rendering the app
  if (process.argv.includes('publish')) {
    const publishIndex = process.argv.indexOf('publish')
    const agentIds = process.argv.slice(publishIndex + 1)
    const result = await handlePublish(agentIds)

    if (result.success && result.publisherId && result.agents) {
      console.log(green('✅ Successfully published:'))
      for (const agent of result.agents) {
        console.log(
          cyan(
            `  - ${agent.displayName} (${result.publisherId}/${agent.id}@${agent.version})`,
          ),
        )
      }
      process.exit(0)
    } else {
      console.log(red('❌ Publish failed'))
      if (result.error) console.log(red(`Error: ${result.error}`))
      if (result.details) console.log(red(result.details))
      if (result.hint) console.log(yellow(`Hint: ${result.hint}`))
      process.exit(1)
    }
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
        fileTree={fileTree}
        continueChat={continueChat}
        continueChatId={continueId ?? undefined}
        initialMode={initialMode}
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
