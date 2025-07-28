#!/usr/bin/env node

import { enableSquashNewlines } from './display/squash-newlines'

import { type CostMode } from '@codebuff/common/constants'
import { Command, Option } from 'commander'
import { red } from 'picocolors'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { displayLoadedAgents, loadLocalAgents } from './agents/load-agents'
import { CLI } from './cli'
import { cliArguments, cliOptions } from './cli-definitions'
import { npmAppVersion } from './config'
import { createTemplateProject } from './create-template-project'
import { printModeLog, setPrintMode } from './display/print-mode'
import {
  getStartingDirectory,
  initProjectFileContextWithWorker,
  setProjectRoot,
  setWorkingDirectory,
} from './project-files'
import { rageDetectors } from './rage-detectors'
import { logAndHandleStartup } from './startup-process-handler'
import { recreateShell } from './terminal/run-command'
import { CliOptions } from './types'
import { initAnalytics, trackEvent } from './utils/analytics'
import { findGitRoot } from './utils/git'
import { logger } from './utils/logger'

async function codebuff({
  initialInput,
  git,
  costMode,
  runInitFlow,
  model,
  agent,
  params,
  print,
  cwd,
  trace,
}: CliOptions) {
  enableSquashNewlines()

  // Initialize starting directory
  const { cwd: workingDir, shouldSearch } = getStartingDirectory(cwd)
  const gitRoot = shouldSearch
    ? findGitRoot(workingDir) ?? workingDir
    : workingDir
  const projectRoot = setProjectRoot(gitRoot)
  setWorkingDirectory(workingDir)

  await recreateShell(workingDir)

  // Kill all processes we failed to kill before
  const processCleanupPromise = logAndHandleStartup()

  initAnalytics()
  rageDetectors.startupTimeDetector.start()

  const initFileContextPromise = initProjectFileContextWithWorker(projectRoot)

  const readyPromise = Promise.all([
    initFileContextPromise,
    processCleanupPromise,
  ])

  // Initialize the CLI singleton
  CLI.initialize(readyPromise, {
    git,
    costMode,
    model,
    agent,
    params,
    print,
    trace,
  })
  await loadLocalAgents({ verbose: true }).then(() => displayLoadedAgents())
  const cli = CLI.getInstance()

  await cli.printInitialPrompt({ initialInput, runInitFlow })

  rageDetectors.startupTimeDetector.end()
}

if (require.main === module) {
  const program = new Command()

  program.name('codebuff').version(npmAppVersion || '0.0.0')

  // Add arguments from shared definitions
  cliArguments.forEach((arg) => {
    // For hidden arguments, just skip adding them to the help text
    if (!arg.hidden) {
      program.argument(arg.flags, arg.description)
    }
  })

  // Add options from shared definitions
  cliOptions.forEach((opt) => {
    const optionInstance = new Option(opt.flags, opt.description)
    if (opt.hidden) {
      optionInstance.hideHelp(true)
    }
    program.addOption(optionInstance)
  })

  program.addHelpText(
    'after',
    `
Examples:
  $ codebuff                            # Start in current directory
  $ codebuff -p "tell me about the codebase"  # Print mode (non-interactive)
  $ codebuff --cwd my-project           # Start in specific directory
  $ codebuff --trace                    # Enable subagent trace logging to .agents/traces/*.log
  $ codebuff --create nextjs my-app     # Create and scaffold a new Next.js project
  $ codebuff --agent file_picker "find relevant files for authentication"
  $ codebuff --agent reviewer --params '{"focus": "security"}' "review this code"

For all commands and options, run 'codebuff' and then type 'help'.
`
  )

  program.parse()

  const options = program.opts()
  const args = program.args

  // Handle template creation
  if (options.create) {
    const template = options.create
    const projectDir = args[0] || '.'
    const projectName = args[1] || template

    createTemplateProject(template, projectDir, projectName)
    process.exit(0)
  }

  // Handle deprecated --pro flag
  if (options.pro) {
    console.error(
      red(
        'Warning: The --pro flag is deprecated. Please restart codebuff and use the --max option instead.'
      )
    )
    logger.error(
      {
        errorMessage:
          'The --pro flag is deprecated. Please restart codebuff and use the --max option instead.',
      },
      'Deprecated --pro flag used'
    )
    process.exit(1)
  }

  // Determine cost mode
  let costMode: CostMode = 'normal'
  if (options.lite) {
    costMode = 'lite'
  } else if (options.max) {
    costMode = 'max'
  } else if (options.experimental) {
    costMode = 'experimental'
  } else if (options.ask) {
    costMode = 'ask'
  }

  // Handle git integration
  const git = options.git === 'stage' ? ('stage' as const) : undefined

  // Validate print mode requirements
  if (options.print) {
    const hasPrompt = args.length > 0
    const hasParams = options.params

    setPrintMode(true)
    trackEvent(AnalyticsEvent.PRINT_MODE, {
      args,
      options,
    })

    if (!hasPrompt && !hasParams) {
      printModeLog({
        type: 'error',
        message:
          'Error: Print mode requires either a prompt or --params to be set',
      })
      process.exit(1)
    }
  }

  // Parse agent params if provided
  let parsedAgentParams: Record<string, any> | undefined
  if (options.params) {
    try {
      parsedAgentParams = JSON.parse(options.params)
    } catch (error) {
      console.error(red(`Error parsing --params JSON: ${error}`))
      process.exit(1)
    }
  }

  // Remove the first argument if it's the compiled binary path which bun weirdly injects (starts with /$bunfs)
  const filteredArgs = args[0]?.startsWith('/$bunfs') ? args.slice(1) : args
  const initialInput = filteredArgs.join(' ')

  codebuff({
    initialInput,
    git,
    costMode,
    runInitFlow: options.init,
    model: options.model,
    agent: options.agent,
    params: parsedAgentParams,
    print: options.print,
    cwd: options.cwd,
    trace: options.trace,
  })
}
