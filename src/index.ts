import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { last } from 'lodash'
import { ProjectFileContext } from '@manicode/common/src/util/file'
import {
  applyChanges,
  getProjectFileContext,
  getFileBlocks,
} from './project-files'
import { APIRealtimeClient } from 'common/src/websockets/websocket-client'
import { Message } from 'common/src/actions'
import { STOP_MARKER } from '@manicode/common/src/prompts'

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

async function manicode(userPrompt: string | undefined) {
  const websockedUrl = 'ws://localhost:3000/ws'
  const ws = new APIRealtimeClient(websockedUrl)
  await ws.connect()

  ws.subscribe('change-files', (a) => {
    const changesSuceeded = applyChanges(a.changes)

    if (changesSuceeded.length > 0) {
      const content =
        `The following files were updated based on the assistant's instruction:\n` +
        changesSuceeded.map(({ filePath }) => filePath).join('\n')

      messageHistory.push({
        role: 'user',
        content,
      })
    }
  })

  ws.subscribe('tool-call', (a) => {
    const { response, data } = a
    const { id, name, input } = data

    messageHistory.push({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: response,
        },
        {
          type: 'tool_use',
          id,
          name,
          input,
        },
      ],
    })

    if (name === 'read_files') {
      const { file_paths } = input
      const files = getFileBlocks(file_paths)

      messageHistory.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: files,
          },
        ],
      })

      ws.sendAction({
        type: 'user-input',
        messages: messageHistory,
        fileContext: getProjectFileContext(),
      })
    }
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const messageHistory: Message[] = []

  const handleUserInput = async (userInput: string) => {
    const lastMessage = last(messageHistory)
    if (lastMessage && lastMessage.role === 'user') {
      lastMessage.content += `\n\n${userInput}`
    } else {
      messageHistory.push({ role: 'user', content: userInput })
    }

    // Get updated file context
    const fileContext = getProjectFileContext()

    const claudeResponse = await sendUserInputAndAwaitResponse(
      ws,
      messageHistory,
      fileContext
    )

    messageHistory.push({
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
  messageHistory: Message[],
  fileContext: ProjectFileContext
) {
  let response = ''
  return await new Promise<string>((resolve) => {
    const unsubscribe = ws.subscribe('response-chunk', (a) => {
      const { chunk } = a
      process.stdout.write(chunk)
      response += chunk

      if (response.includes(STOP_MARKER)) {
        unsubscribe()
        resolve(response)
      }
    })

    ws.sendAction({
      type: 'user-input',
      messages: messageHistory,
      fileContext,
    })
  })
}
