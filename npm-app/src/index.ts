#!/usr/bin/env node

import { websocketUrl } from './config'
import { Client } from './client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'
import { getProjectFileContext, initProjectRoot } from './project-files'

async function manicode(projectDir: string | undefined) {
  const dir = initProjectRoot(projectDir)
  console.log(`Manicode will read and write files in "${dir}". Press ESC for menu.`)
  // Preload.
  getProjectFileContext()

  const chatStorage = new ChatStorage()

  const client = new Client(websocketUrl, chatStorage)
  await client.connect()

  const cli = new CLI(client, chatStorage)
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
