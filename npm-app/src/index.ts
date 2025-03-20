#!/usr/bin/env node

import { Command } from 'commander'
import { type CostMode } from 'common/constants'
import { red } from 'picocolors'
import packageJson from '../package.json'

import { CLI } from './cli'
import {
  initProjectFileContextWithWorker,
  setProjectRoot,
} from './project-files'
import { updateCodebuff } from './update-codebuff'
import { CliOptions } from './types'
import { recreateShell } from './utils/terminal'
import { createTemplateProject } from './create-template-project'

async function codebuff(
  projectDir: string | undefined,
  { initialInput, git, costMode }: CliOptions
) {
  const dir = setProjectRoot(projectDir)
  recreateShell(dir)

  const updatePromise = updateCodebuff()
  const initFileContextPromise = initProjectFileContextWithWorker(dir)

  const readyPromise = Promise.all([updatePromise, initFileContextPromise])

  const cli = new CLI(readyPromise, { git, costMode })

  await cli.printInitialPrompt(initialInput)
}

if (require.main === module) {
  const program = new Command()

  program
    .name('codebuff')
    .description('AI code buffer')
    .version(packageJson.version)
    .argument('[project-directory]', 'Project directory (default: current directory)')
    .argument('[initial-prompt...]', 'Initial prompt to send')
    .option('--create <template> [name]', 'Create new project from template')
    .option('--lite', 'Use budget models & fetch fewer files')
    .option('--max', 'Use higher quality models and fetch more files')
    .option('--pro', 'Deprecated: Use --max instead')
    // .option('--git <mode>', 'Git integration mode', 'none')
    .addHelpText('after', `
Examples:
  $ codebuff                            # Start in current directory
  $ codebuff my-project                 # Start in specific directory
  $ codebuff --create nextjs my-app     # Create new Next.js project
  $ codebuff . "fix the bug in foo()"   # Start with initial prompt

Available templates:
  nextjs    - Next.js starter template
  convex    - Convex starter template
  vite      - Vite starter template
  remix     - Remix starter template
  node-cli  - Node.js CLI starter template
  python-cli - Python CLI starter template
  chrome-extension - Chrome extension starter template

See all templates at:
  https://github.com/CodebuffAI/codebuff-community/tree/main/starter-templates`)

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
  } else if (options.max || options.o1) {
    costMode = 'max'
  }

  // Handle git integration
  const git = options.git === 'stage' ? ('stage' as const) : undefined

  // Get project directory and initial input
  const projectPath = args[0]
  const initialInput = args.slice(1).join(' ')

  codebuff(projectPath, { initialInput, git, costMode })
}
