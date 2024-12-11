#!/usr/bin/env node

import fs from 'fs'
import { type Mode } from 'common/constants'
import path from 'path'
import { yellow } from 'picocolors'

import { CLI } from './cli'
import {
  initProjectFileContextWithWorker,
  setProjectRoot,
} from './project-files'
import { updateCodebuff } from './update-codebuff'

async function codebuff(
  projectDir: string | undefined,
  {
    initialInput,
    autoGit,
    mode,
  }: { initialInput?: string; autoGit: boolean; mode: Mode }
) {
  const dir = setProjectRoot(projectDir)

  const updatePromise = updateCodebuff()
  const initFileContextPromise = initProjectFileContextWithWorker(dir)

  const readyPromise = Promise.all([updatePromise, initFileContextPromise])

  const cli = new CLI(readyPromise, { autoGit, mode })

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
  const autoGit = args.includes('--auto-git')
  if (autoGit) {
    args.splice(args.indexOf('--auto-git'), 1)
  }

  let mode: Mode = 'normal'
  if (args.includes('--cheap')) {
    mode = 'cheap'
    args.splice(args.indexOf('--cheap'), 1)
  } else if (args.includes('--expensive')) {
    mode = 'expensive'
    args.splice(args.indexOf('--expensive'), 1)
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
      '  --cheap                         Use lower quality models & fetch fewer files'
    )
    console.log(
      '  --expensive                     Use higher quality models and fetch more files'
    )
    console.log(
      '  --auto-git                      Enable automatic git commits'
    )
    console.log()
    console.log(
      'Codebuff allows you to interact with your codebase using natural language.'
    )
    process.exit(0)
  }

  codebuff(projectPath, { initialInput, autoGit, mode })
}
