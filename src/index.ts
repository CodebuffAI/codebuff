import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { ProjectFileContext } from '@manicode/common/src/util/file'
import { applyChanges, getProjectFileContext } from './project-files'
import { APIRealtimeClient } from 'common/src/websockets/websocket-client'

const runScript = (fn: () => Promise<void>) => {
  // Load environment variables from .env file
  const envPath = path.join(__dirname, '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const envLines = envContent.split('\n')
    for (const line of envLines) {
      const [key, value] = line.split('=')
      if (key && value) {
        process.env[key.trim()] = value.trim()
      }
    }
  }
  fn()
}

runScript(async () => {
  const userPrompt = process.argv[2] || undefined
  await manicode(userPrompt)
})

interface ConversationEntry {
  role: 'user' | 'assistant' | 'system'
  content: string
}

async function manicode(userPrompt: string | undefined) {
  const websockedUrl = 'ws://localhost:3000/ws'
  const ws = new APIRealtimeClient(websockedUrl)
  await ws.connect()

  ws.subscribe('change-files', (a) => {
    const changesSuceeded = applyChanges(a.changes)

    const content =
      `The following files were updated based on the assistant's instruction:\n` +
      changesSuceeded.map(({ filePath }) => filePath).join('\n')

    conversationHistory.push({
      role: 'system',
      content,
    })
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const conversationHistory: ConversationEntry[] = []

  const handleUserInput = async (userInput: string) => {
    conversationHistory.push({ role: 'user', content: userInput })

    const fullPrompt = conversationHistory
      .map(({ role, content }) => {
        const label =
          role === 'user'
            ? 'The user said:'
            : role === 'assistant'
              ? 'The assistant said:'
              : 'System:'
        return `${label}\n\n${content}`
      })
      .join('\n\n')

    // Get updated file context
    const fileContext = getProjectFileContext()

    const claudeResponse = await sendUserInputAndAwaitResponse(
      ws,
      fullPrompt,
      fileContext
    )

    conversationHistory.push({
      role: 'assistant',
      content: claudeResponse,
    })
  }

  await new Promise<void>((resolve) => {
    function onInput(userInput: string) {
      const exitWords = ['exit', 'quit', 'q']
      if (exitWords.includes(userInput.trim().toLowerCase())) {
        rl.close()
        resolve()
      } else {
        handleUserInput(userInput).then(promptUser)
      }
    }

    function promptUser() {
      rl.question('Enter your prompt (or type "quit" or "q"):\n>', onInput)
    }

    if (userPrompt) onInput(userPrompt)
    else promptUser()
  })

  console.log('Manicode session ended.')
}

async function sendUserInputAndAwaitResponse(
  ws: APIRealtimeClient,
  input: string,
  fileContext: ProjectFileContext
) {
  let response = ''
  return await new Promise<string>((resolve) => {
    const unsubscribe = ws.subscribe('response-chunk', (a) => {
      const { chunk } = a
      process.stdout.write(chunk)
      response += chunk

      if (response.includes('[END_OF_RESPONSE]')) {
        unsubscribe()
        resolve(response)
      }
    })

    ws.sendAction({
      type: 'user-input',
      input,
      fileContext,
    })
  })
}
