#!/usr/bin/env node

import { websocketUrl } from './config'
import { Client } from './client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'
import { getProjectFileContext } from './project-files'

async function manicode(userPrompt: string | undefined) {
  console.log('What would you like to do? (Press ESC for menu)')

  // Preload.
  getProjectFileContext()

  const chatStorage = new ChatStorage()
  const client = new Client(websocketUrl, chatStorage)

  const cli = new CLI(client, chatStorage)
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
