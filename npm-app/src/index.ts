#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { yellow } from 'picocolors'

import { initFingerprint } from './config'
import { CLI } from './cli'
import { getProjectFileContext, initProjectRoot } from './project-files'

async function manicode(projectDir: string | undefined) {
  const dir = initProjectRoot(projectDir)

  // Preload stuff.
  const fingerprintPromise = initFingerprint()
  const initProjectFileContextPromise = await getProjectFileContext([], {})

  const readyPromise = Promise.all([
    fingerprintPromise,
    initProjectFileContextPromise,
  ])

  const cli = new CLI(readyPromise)

  console.log(
    `Manicode will read and write files in "${dir}". Type "help" for a list of commands`
  )

  const gitDir = path.join(dir, '.git')
  if (!fs.existsSync(gitDir)) {
    console.warn(
      yellow(
        'Warning: No .git directory found. Make sure you are at the top level of your project.'
      )
    )
  }

  cli.printInitialPrompt()
}

if (require.main === module) {
  const arg = process.argv[2]
  if (arg === '--help' || arg === '-h') {
    console.log('Usage: manicode [project-directory]')
    console.log(
      'If no project directory is specified, Manicode will use the current directory.'
    )
    console.log()
    console.log(
      'Manicode allows you to interact with your codebase using natural language.'
    )
    process.exit(0)
  }

  manicode(arg)
}
