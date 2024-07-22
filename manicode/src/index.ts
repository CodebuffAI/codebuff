#!/usr/bin/env node

import { loadEnvironmentVariables, projectRoot, websocketUrl } from './config'
import { ChatClient } from './chat-client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'
import { getProjectFileContext } from './project-files'

async function manicode(userPrompt: string | undefined) {
  console.log('What would you like to do? (Press ESC for menu)')

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
  loadEnvironmentVariables()
  const userPrompt = process.argv[2] || undefined
  manicode(userPrompt)
}
