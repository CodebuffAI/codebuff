#!/usr/bin/env node

import { Argument, Command, Option } from 'commander'
import { type CostMode } from 'common/constants'
import { loadCodebuffConfig } from 'common/json-config/parser'
import { red } from 'picocolors'

import packageJson from '../package.json'
import { CLI } from './cli'
import { cliArguments, cliOptions } from './cli-definitions'
import { createTemplateProject } from './create-template-project'
import { enableSquashNewlines } from './display'
import {
  getStartingDirectory,
  initProjectFileContextWithWorker,
  setProjectRoot,
  setWorkingDirectory,
} from './project-files'
import { logAndHandleStartup } from './startup-process-handler'
import { CliOptions } from './types'
import { updateCodebuff } from './update-codebuff'
import { initAnalytics } from './utils/analytics'
import { findGitRoot } from './utils/git'
import { recreateShell } from './utils/terminal'

async function codebuff(
  projectDir: string | undefined,
  { initialInput, git, costMode, runInitFlow, model }: CliOptions
) {
  enableSquashNewlines()

  // Initialize starting directory
  const { cwd, shouldSearch } = getStartingDirectory(projectDir)
  const gitRoot = shouldSearch ? findGitRoot(cwd) ?? cwd : cwd
  const projectRoot = setProjectRoot(gitRoot)
  setWorkingDirectory(cwd)

  recreateShell(cwd)

  // Load config file if it exists
  const config = loadCodebuffConfig(projectRoot)

  // Kill all processes we failed to kill before
  const processCleanupPromise = logAndHandleStartup(projectRoot, config)

  initAnalytics()

  const updatePromise = updateCodebuff()

  const initFileContextPromise = initProjectFileContextWithWorker(projectRoot)

  const readyPromise = Promise.all([
    initFileContextPromise,
    updatePromise,
    processCleanupPromise,
  ])

  // Initialize the CLI singleton
  CLI.initialize(readyPromise, { git, costMode, model })
  const cli = CLI.getInstance()

  await cli.printInitialPrompt({ initialInput, runInitFlow })
}

if (require.main === module) {
  const program = new Command()

  program.name('codebuff').version(packageJson.version)

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
  $ codebuff my-project                 # Start in specific directory
  $ codebuff --create nextjs my-app     # Create and scaffold a new Next.js project

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
  }

  // Handle git integration
  const git = options.git === 'stage' ? ('stage' as const) : undefined

  // Get project directory and initial input
  const projectPath = args[0]
  const initialInput = args.slice(1).join(' ')

  codebuff(projectPath, {
    initialInput,
    git,
    costMode,
    runInitFlow: options.init,
    model: options.model,
  })
}
