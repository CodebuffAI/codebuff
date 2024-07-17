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
import { ChatStorage } from './chat-storage'

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

  const projectRoot = path.resolve(__dirname, '..')
  const chatStorage = new ChatStorage(projectRoot)

  let currentChat = chatStorage.createChat()
  console.log(`Started new chat session with ID: ${currentChat.id}`)

  const addUserMessage = (userInput: string) => {
    const lastMessage = last(currentChat.messages)
    if (
      lastMessage &&
      lastMessage.role === 'user' &&
      typeof lastMessage.content === 'string'
    ) {
      lastMessage.content += `\n\n${userInput}`
      chatStorage.addMessage(currentChat.id, lastMessage)
    } else {
      const newMessage: Message = { role: 'user', content: userInput }
      currentChat = chatStorage.addMessage(currentChat.id, newMessage) || currentChat
    }
  }

  ws.subscribe('change-files', (a) => {
    const changesSuceeded = applyChanges(a.changes)

    if (changesSuceeded.length > 0) {
      const content =
        `The following files were updated based on Manny's instruction:\n` +
        changesSuceeded.map(({ filePath }) => filePath).join('\n')

      // addUserMessage(content)
    }
  })

  ws.subscribe('tool-call', (a) => {
    const { response, data } = a
    const { id, name, input } = data

    const assistantMessage: Message = {
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
    }
    currentChat = chatStorage.addMessage(currentChat.id, assistantMessage) || currentChat

    if (name === 'read_files') {
      const { file_paths } = input
      const files = getFileBlocks(file_paths)

      const toolResultMessage: Message = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: files,
          },
        ],
      }
      currentChat = chatStorage.addMessage(currentChat.id, toolResultMessage) || currentChat

      ws.sendAction({
        type: 'user-input',
        messages: currentChat.messages,
        fileContext: getProjectFileContext(),
      })
    }
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  let isReceivingResponse = false
  let stopResponseRequested = false

  process.stdin.on('data', (key: string) => {
    if (key === '\u001B') { // ESC key
      if (isReceivingResponse) {
        stopResponseRequested = true
        console.log('\n[Response stopped by user]')
      }
    }
  })

  const handleUserInput = async (userInput: string) => {
    addUserMessage(userInput)

    // Get updated file context
    const fileContext = getProjectFileContext()

    isReceivingResponse = true
    stopResponseRequested = false

    const mannyResponse = await sendUserInputAndAwaitResponse(
      ws,
      currentChat.messages,
      fileContext,
      () => stopResponseRequested
    )

    isReceivingResponse = false

    if (!stopResponseRequested) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: mannyResponse,
      }
      currentChat = chatStorage.addMessage(currentChat.id, assistantMessage) || currentChat
    }
  }

  await new Promise<void>((resolve) => {
    function onInput(userInput: string) {
      const exitWords = ['exit', 'quit', 'q']
      if (exitWords.includes(userInput.trim().toLowerCase())) {
        rl.close()
        resolve()
      } else if (userInput.trim().toLowerCase() === 'new chat') {
        currentChat = chatStorage.createChat([])
        console.log(`Started new chat session with ID: ${currentChat.id}`)
        promptUser()
      } else if (userInput.trim().toLowerCase().startsWith('load chat ')) {
        const chatId = userInput.trim().split(' ')[2]
        const loadedChat = chatStorage.getChat(chatId)
        if (loadedChat) {
          currentChat = loadedChat
          console.log(`Loaded chat session with ID: ${currentChat.id}`)
        } else {
          console.log(`Chat session with ID ${chatId} not found.`)
        }
        promptUser()
      } else if (userInput.trim().toLowerCase() === 'list chats') {
        const chats = chatStorage.listChats()
        console.log('Available chat sessions:')
        chats.forEach(chat => {
          console.log(`- ID: ${chat.id}, Created: ${chat.createdAt}, Updated: ${chat.updatedAt}`)
        })
        promptUser()
      } else {
        handleUserInput(userInput).then(promptUser)
      }
    }

    function promptUser() {
      rl.question('Enter your prompt for Manny (or type "new chat", "load chat <id>", "list chats", or "quit"):\n>', onInput)
    }

    if (userPrompt) onInput(userPrompt)
    else promptUser()
  })

  console.log('Manicode session with Manny ended.')
}

async function sendUserInputAndAwaitResponse(
  ws: APIRealtimeClient,
  messageHistory: Message[],
  fileContext: ProjectFileContext,
  isStopRequested: () => boolean
) {
  let response = ''
  return await new Promise<string>((resolve) => {
    const unsubscribe = ws.subscribe('response-chunk', (a) => {
      const { chunk } = a
      process.stdout.write(chunk)
      response += chunk

      if (response.includes(STOP_MARKER) || isStopRequested()) {
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
