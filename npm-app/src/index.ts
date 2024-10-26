#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { yellow } from 'picocolors'


import { CLI } from './cli'
import {
  initProjectFileContextWithWorker,
  setProjectRoot,
} from './project-files'
import { updateManicode } from './update-manicode'
import { calculateFingerprint } from './fingerprint'

async function manicode(
  projectDir: string | undefined,
  { initialInput, autoGit }: { initialInput?: string; autoGit: boolean }
) {
  const dir = setProjectRoot(projectDir)

  const updatePromise = updateManicode()
  const fingerprintPromise = calculateFingerprint()
  const initFileContextPromise = initProjectFileContextWithWorker(dir)

  const readyPromise = Promise.all([updatePromise, initFileContextPromise])

  const defaultFingerprintId = await fingerprintPromise
  const cli = new CLI(readyPromise, { autoGit, defaultFingerprintId })

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
  const args = process.argv.slice(2)
  const help = args.includes('--help') || args.includes('-h')
  const autoGit = args.includes('--auto-git')
  if (autoGit) {
    args.splice(args.indexOf('--auto-git'), 1)
  }

  const projectPath = args[0]
  const initialInput = args.slice(1).join(' ')

  if (help) {
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

  manicode(projectPath, { initialInput, autoGit })
}
