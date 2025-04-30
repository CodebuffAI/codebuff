#!/usr/bin/env node

import { Command } from 'commander'
import { type CostMode } from 'common/constants'
import { loadCodebuffConfig } from 'common/json-config/parser'
import { red } from 'picocolors'

import packageJson from '../package.json'
import { CLI } from './cli'
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

  // First try to find a git root directory
  if (!projectDir) {
    projectDir = getStartingDirectory()
  }
  const gitRoot = findGitRoot(projectDir)
  const dir = setProjectRoot(gitRoot || projectDir)
  setWorkingDirectory(projectDir)

  recreateShell(dir)

  // Load config file if it exists
  const config = loadCodebuffConfig(dir)

  // Kill all processes we failed to kill before
  const processCleanupPromise = logAndHandleStartup(dir, config)

  initAnalytics()

  const updatePromise = updateCodebuff()

  const initFileContextPromise = initProjectFileContextWithWorker(dir)

  const readyPromise = Promise.all([
    initFileContextPromise,
    updatePromise,
    processCleanupPromise,
  ])

  const cli = new CLI(readyPromise, { git, costMode, model })

  await cli.printInitialPrompt({ initialInput, runInitFlow })
}

if (require.main === module) {
  const program = new Command()

  program
    .name('codebuff')
    .description('AI code buffer')
    .version(packageJson.version)
    .argument(
      '[project-directory]',
      'Project directory (default: current directory)'
    )
    .argument('[initial-prompt...]', 'Initial prompt to send')
    .option('--lite', 'Use budget models & fetch fewer files')
    .option('--max', 'Use higher quality models and fetch more files')
    .option(
      '--experimental',
      'Use cutting-edge experimental features and models'
    )
    .option('--create <template> [name]', 'Create new project from template')
    .option(
      '--init',
      'Initialize codebuff on this project for a smoother experience'
    )
    .option(
      '--model <model>',
      'Experimental: Specify the main model to use for the agent ("sonnet-3.6", "sonnet-3.7", "gpt-4.1", "gemini-2.5-pro", "o4-mini", "o3"). Be aware codebuff might not work as well with non-default models.'
    )
    .addHelpText(
      'after',
      `
Available templates for --create:
  nextjs    - Next.js starter template
  convex    - Convex starter template
  vite      - Vite starter template
  remix     - Remix starter template
  node-cli  - Node.js CLI starter template
  python-cli - Python CLI starter template
  chrome-extension - Chrome extension starter template

  See all templates at:
    https://github.com/CodebuffAI/codebuff-community/tree/main/starter-templates

Examples:
  $ codebuff                            # Start in current directory
  $ codebuff my-project                 # Start in specific directory
  $ codebuff --create nextjs my-app     # Create new Next.js project
  $ codebuff . "fix the bug in foo()"   # Start with initial prompt
  
The recommended way to get started is by running 'codebuff' in your project directory.
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
