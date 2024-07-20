import { loadEnvironmentVariables, websocketUrl, projectRoot } from './config'
import { ChatClient } from './chat-client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'

async function manicode(userPrompt: string | undefined) {
  console.log('What would you like to do?')

  const chatStorage = new ChatStorage(projectRoot)
  const wsClient = new ChatClient(websocketUrl, chatStorage)

  const cli = new CLI(chatStorage, wsClient)
  cli.start()

  await wsClient.connect()

  if (userPrompt) {
    await cli.handleUserInput(userPrompt)
  }
}

loadEnvironmentVariables()
const userPrompt = process.argv[2] || undefined
manicode(userPrompt)
