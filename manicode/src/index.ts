#!/usr/bin/env node

import { projectRoot, websocketUrl } from './config'
import { ChatClient } from './chat-client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'
import { getProjectFileContext } from './project-files'

async function manicode(userPrompt: string | undefined) {
  console.log('What would you like to do? (Press ESC for menu)')

  // Preload.
  getProjectFileContext()

  const chatStorage = new ChatStorage(projectRoot)
  const client = new ChatClient(websocketUrl, chatStorage)

  const cli = new CLI(chatStorage, client)
  cli.start()

  await client.connect()

  if (userPrompt) {
    await cli.handleUserInput(userPrompt)
  }
}

if (require.main === module) {
  const userPrompt = process.argv[2] || undefined
  manicode(userPrompt)
}
