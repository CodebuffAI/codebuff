#!/usr/bin/env node

import { websocketUrl } from './config'
import { Client } from './client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'
import { getProjectFileContext } from './project-files'

async function manicode(userPrompt: string | undefined) {
  // Preload.
  getProjectFileContext()

  const chatStorage = new ChatStorage()

  const client = new Client(websocketUrl, chatStorage)
  await client.connect()

  const cli = new CLI(client, chatStorage)

  if (userPrompt) {
    await cli.handleUserInput(userPrompt)
  } else {
    cli.printInitialPrompt()
  }
}

if (require.main === module) {
  const userPrompt = process.argv[2] || undefined
  manicode(userPrompt)
}
