#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { yellow } from 'picocolors'

import { initFingerprint } from './config'
import { CLI } from './cli'
import { getProjectFileContext, initProjectRoot } from './project-files'
import { updateManicode } from './update-manicode'

async function manicode(projectDir: string | undefined) {
  console.log('Starting Manicode...')
  const dir = initProjectRoot(projectDir)

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

  cli.printInitialPrompt()
}

// ... rest of the file remains unchanged ...
