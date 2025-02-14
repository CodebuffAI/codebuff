#!/usr/bin/env node

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
  recreateShell()

  const [_, fileContext] = await Promise.all([
    updateCodebuff(),
    initProjectFileContextWithWorker(dir)
  ])

  const cli = new CLI(Promise.resolve([undefined, fileContext]), { git, costMode })
  await cli.printInitialPrompt(initialInput)
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const help = args.includes('--help') || args.includes('-h')
  const version = args.includes('--version') || args.includes('-v')

  if (version) {
    console.log(`Codebuff v${packageJson.version}`)
    process.exit(0)
  }

  // Handle --create flag before other flags
  const createIndex = args.indexOf('--create')
  if (createIndex !== -1) {
    const template = args[createIndex + 1]
    const projectDir = args[0] !== '--create' ? args[0] : '.'
    const projectName = args[createIndex + 2] || template

    if (!template) {
      console.error('Please specify a template name')
      console.log('Available templates:')
      console.log('  nextjs    - Next.js starter template')
      console.log('\nSee all templates at:')
      console.log(
        '  https://github.com/CodebuffAI/codebuff-community/tree/main/starter-templates'
      )
      process.exit(1)
    }

    createTemplateProject(template, projectDir, projectName)
    process.exit(0)
  }

  const gitArg = args.indexOf('--git')
  const git = gitArg !== -1 && args[gitArg + 1] === 'stage' 
    ? ('stage' as const) 
    : undefined
  if (gitArg !== -1) {
    args.splice(gitArg, 2)
  }

  let costMode: CostMode = 'normal'
  if (args.includes('--lite')) {
    costMode = 'lite'
    args.splice(args.indexOf('--lite'), 1)
  } else if (args.some(arg => ['--pro', '--o1', '--max'].includes(arg))) {
    costMode = 'max'

    // Remove whichever flag was used
    if (args.includes('--pro')) {
      args.splice(args.indexOf('--pro'), 1)
      console.error(
        red(
          'Warning: The --pro flag is deprecated. Please restart codebuff and use the --max option instead.'
        )
      )
      process.exit(1)
    }
    
    // Remove whichever flag was used
    for (const flag of ['--o1', '--max']) {
      const index = args.indexOf(flag)
      if (index !== -1) args.splice(index, 1)
    }
  }

  if (help) {
    console.log('Usage: codebuff [project-directory] [initial-prompt]')
    console.log('Both arguments are optional.')
    console.log()
    console.log('Version:')
    console.log('  --version, -v               Show version number')
    console.log(
      'If no project directory is specified, Codebuff will use the current directory.'
    )
    console.log(
      'If an initial prompt is provided, it will be sent as the first user input.'
    )
    console.log()
    console.log('Project Creation:')
    console.log(
      '  --create <template> [name]      Create new project from template'
    )
    console.log(
      '                                  Example: codebuff --create nextjs my-app'
    )
    console.log('                                  See all templates at:')
    console.log(
      '                                  https://github.com/CodebuffAI/codebuff-community/tree/main/starter-templates'
    )
    console.log()
    console.log('Performance Options:')
    console.log(
      '  --lite                          Use budget models & fetch fewer files'
    )
    console.log(
      '  --max                           Use higher quality models and fetch more files'
    )
    console.log()
    console.log('Git Integration:')
    console.log(
      '  --git stage                     Stage changes from last message'
    )
    console.log()
    console.log(
      'Codebuff allows you to interact with your codebase using natural language.'
    )
    process.exit(0)
  }

  const projectPath = args[0]
  const initialInput = args.slice(1).join(' ')

  codebuff(projectPath, { initialInput, git, costMode })
}
