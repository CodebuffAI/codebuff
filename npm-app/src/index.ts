#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { yellow } from 'picocolors'

import { initFingerprint } from './config'
import { CLI } from './cli'
import { getProjectFileContext, setProjectRoot } from './project-files'
import { updateManicode } from './update-manicode'

async function manicode(projectDir: string | undefined, initialInput?: string) {
  const dir = setProjectRoot(projectDir)

  const updatePromise = updateManicode()
  const fingerprintPromise = initFingerprint()
  const initFileContextPromise = getProjectFileContext([], {})

  const readyPromise = Promise.all([
    updatePromise,
    fingerprintPromise,
    initFileContextPromise,
  ])

  const cli = new CLI(readyPromise)

  await readyPromise

  console.log(
    `Manicode will read and write files in "${dir}". Type "help" for a list of commands.`
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
  const arg = process.argv[2]
  const initialInput = process.argv.slice(3).join(' ')
  if (
    arg === '--help' ||
    arg === '-h' ||
    initialInput === '--help' ||
    initialInput === '-h'
  ) {
    console.log('Usage: manicode [project-directory] [initial-prompt]')
    console.log('Both arguments are optional.')
    console.log(
      'If no project directory is specified, Manicode will use the current directory.'
    )
    console.log(
      'If an initial prompt is provided, it will be sent as the first user input.'
    )
    console.log()
    console.log(
      'Manicode allows you to interact with your codebase using natural language.'
    )
    process.exit(0)
  }

  manicode(arg, initialInput)
}
