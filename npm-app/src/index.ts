#!/usr/bin/env node

import fs from 'fs'
import { type CostMode } from 'common/constants'
import path from 'path'
import { bold, yellow, blueBright, red } from 'picocolors'

import { CLI } from './cli'
import {
  initProjectFileContextWithWorker,
  setProjectRoot,
} from './project-files'
import { updateCodebuff } from './update-codebuff'
import { CliOptions } from './types'
import { resetPtyShell } from './utils/terminal'

async function codebuff(
  projectDir: string | undefined,
  { initialInput, git, costMode }: CliOptions
) {
  const dir = setProjectRoot(projectDir)
  resetPtyShell(dir)

  const updatePromise = updateCodebuff()
  const initFileContextPromise = initProjectFileContextWithWorker(dir)

  const readyPromise = Promise.all([updatePromise, initFileContextPromise])

  const cli = new CLI(readyPromise, { git, costMode })

  const costModeDescription = {
    lite: bold(yellow('Lite mode ✨ enabled')),
    normal: '',
    max: bold(blueBright('Max mode️ ⚡ enabled')),
  }
  console.log(`${costModeDescription[costMode]}`)
  console.log(
    `Codebuff will read and write files in "${dir}". Type "help" for a list of commands.`
  )

  const gitDir = path.join(dir, '.git')
  if (!fs.existsSync(gitDir)) {
    console.warn(
      yellow(
        'Warning: No .git directory found. Make sure you are at the top level of your project.'
      )
    )
  }

  cli.printInitialPrompt(initialInput)
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const help = args.includes('--help') || args.includes('-h')
  const gitArg = args.indexOf('--git')
  const git =
    gitArg !== -1 && args[gitArg + 1] === 'stage'
      ? ('stage' as const)
      : undefined
  if (gitArg !== -1) {
    args.splice(gitArg, 2)
  }

  let costMode: CostMode = 'normal'
  if (args.includes('--lite')) {
    costMode = 'lite'
    args.splice(args.indexOf('--lite'), 1)
  } else if (
    args.includes('--pro') ||
    args.includes('--o1') ||
    args.includes('--max')
  ) {
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
    if (args.includes('--o1')) args.splice(args.indexOf('--o1'), 1)
    if (args.includes('--max')) args.splice(args.indexOf('--max'), 1)
  }

  const projectPath = args[0]
  const initialInput = args.slice(1).join(' ')

  if (help) {
    console.log('Usage: codebuff [project-directory] [initial-prompt]')
    console.log('Both arguments are optional.')
    console.log(
      'If no project directory is specified, Codebuff will use the current directory.'
    )
    console.log(
      'If an initial prompt is provided, it will be sent as the first user input.'
    )
    console.log()
    console.log('Options:')
    console.log(
      '  --lite                          Use budget models & fetch fewer files'
    )
    console.log(
      '  --max, --o1                     Use higher quality models and fetch more files'
    )
    console.log(
      '  --git stage                     Stage changes from last message'
    )
    console.log()
    console.log(
      'Codebuff allows you to interact with your codebase using natural language.'
    )
    process.exit(0)
  }

  codebuff(projectPath, { initialInput, git, costMode })
}
