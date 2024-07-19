import { loadEnvironmentVariables, websocketUrl, projectRoot } from './config'
import { WebSocketClient } from './websocket-client'
import { ChatStorage } from './chat-storage'
import { CLI } from './cli'

const runScript = (fn: () => Promise<void>) => {
  loadEnvironmentVariables()
  fn()
}

runScript(async () => {
  const userPrompt = process.argv[2] || undefined
  await manicode(userPrompt)
})

async function manicode(userPrompt: string | undefined) {
  console.log('What would you like to do?')

  const chatStorage = new ChatStorage(projectRoot)
  const wsClient = new WebSocketClient(websocketUrl, chatStorage)
  await wsClient.connect()

  const cli = new CLI(chatStorage, wsClient)
  cli.start()

  if (userPrompt) {
    await cli.handleUserInput(userPrompt)
    cli.promptUser()
  }
}