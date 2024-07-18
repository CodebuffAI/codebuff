import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { ProjectFileContext } from 'common/util/file'
import {
  applyChanges,
  getProjectFileContext,
  getFileBlocks,
  getFiles,
} from './project-files'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { Message } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
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
  console.log('What would you like to do?')

  const websockedUrl = 'ws://localhost:3000/ws'
  const ws = new APIRealtimeClient(websockedUrl)
  await ws.connect()

  const projectRoot = path.resolve(__dirname, '..')
  const chatStorage = new ChatStorage(projectRoot)

  let currentChat = chatStorage.createChat()

  ws.subscribe('change-files', (a) => {
    const changesSuceeded = applyChanges(a.changes)
    for (const change of changesSuceeded) {
      const { filePath, old } = change
      console.log('>', old ? 'Updated' : 'Created', filePath)
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
    chatStorage.addMessage(currentChat, assistantMessage)

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
      chatStorage.addMessage(currentChat, toolResultMessage)

      ws.sendAction({
        type: 'user-input',
        messages: currentChat.messages,
        fileContext: getProjectFileContext(),
      })
    }
  })

  ws.subscribe('read-files', (a) => {
    const { filePaths } = a
    const files = getFiles(filePaths)

    ws.sendAction({
      type: 'read-files-response',
      files,
    })
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
    const ESC_KEY = '\u001B'
    if (key === ESC_KEY) {
      if (isReceivingResponse) {
        stopResponseRequested = true
        console.log('\n[Response stopped by user]')
      } else {
        console.log('\nExiting. Manicode out!')
        process.exit(0)
      }
    }
  })

  const handleUserInput = async (userInput: string) => {
    console.log('...')

    const newMessage: Message = { role: 'user', content: userInput }
    chatStorage.addMessage(currentChat, newMessage)

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

    const assistantMessage: Message = {
      role: 'assistant',
      content: mannyResponse,
    }
    chatStorage.addMessage(currentChat, assistantMessage)

    if (stopResponseRequested) {
      console.log('\n[Response stopped by user. Partial response saved.]')
    }
  }

  await new Promise<void>((resolve) => {
    function onInput(userInput: string) {
      if (userInput.trim().toLowerCase() === 'new chat') {
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
        chats.forEach((chat) => {
          console.log(
            `- ID: ${chat.id}, Created: ${chat.createdAt}, Updated: ${chat.updatedAt}`
          )
        })
        promptUser()
      } else {
        handleUserInput(userInput).then(promptUser)
      }
    }

    function promptUser() {
      rl.question('> ', onInput)
    }

    if (userPrompt) onInput(userPrompt)
    else promptUser()
  })
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

      const stopRequested = isStopRequested()
      if (response.includes(STOP_MARKER) || stopRequested) {
        unsubscribe()

        response = response.replace(STOP_MARKER, '').trim()
        if (stopRequested) {
          response += '\n[RESPONSE_STOPPED_BY_USER]'
        }
        console.log()
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
