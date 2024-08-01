#!/usr/bin/env node

import { websocketUrl } from './config'
import { Client } from './client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'
import { getProjectFileContext, initProjectRoot } from './project-files'

async function manicode(projectDir: string | undefined) {
  initProjectRoot(projectDir)

  // Preload.
  getProjectFileContext()

  const chatStorage = new ChatStorage()

  const client = new Client(websocketUrl, chatStorage)
  await client.connect()

  const cli = new CLI(client, chatStorage)
  cli.printInitialPrompt()
}

if (require.main === module) {
  const projectDir = process.argv[2]
  manicode(projectDir)
}
