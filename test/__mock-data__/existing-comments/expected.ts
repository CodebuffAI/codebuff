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

let responseBuffer = ''

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

  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  let isReceivingResponse = false
  let stopResponseRequested = false
  let responseBuffer = ''
  let inputBuffer = ''
  let historyIndex = -1
  const history: string[] = []
  let isInMenu = false
  let menuSelectedIndex = 0
  let menuOffset = 0
  const NEW_CHAT_OPTION = '+ New chat'
  const CHATS_PER_PAGE = 5

  const clearLine = () => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
  }

  const refreshLine = () => {
    clearLine()
    process.stdout.write(`> ${inputBuffer}`)
  }

  const initializeMenu = () => {
    const chats = chatStorage.listChats()
    const totalItems = chats.length + 1 // +1 for the NEW_CHAT_OPTION
    const middleIndex = Math.floor(CHATS_PER_PAGE / 2)

    const currentChatIndex = chats.findIndex(
      (chat) => chat.id === currentChat.id
    )

    if (currentChatIndex !== -1) {
      menuSelectedIndex = currentChatIndex
    } else {
      menuSelectedIndex = Math.min(middleIndex, totalItems - 1)
    }

    menuOffset = Math.max(
      0,
      Math.min(menuSelectedIndex - middleIndex, totalItems - CHATS_PER_PAGE)
    )

    isInMenu = true
    displayMenu()
  }

  const displayMenu = () => {
    console.clear()
    console.log('Chat History:')
    const chats = chatStorage.listChats()
    const totalItems = chats.length + 1 // +1 for the "New Chat" option
    const startIndex = menuOffset
    const endIndex = Math.min(startIndex + CHATS_PER_PAGE, totalItems)

    for (let i = startIndex; i < endIndex; i++) {
      if (i < chats.length) {
        const chat = chats[i]
        const isSelected = i === menuSelectedIndex
        const marker = isSelected ? '>' : ' '
        console.log(
          `${marker} ${chat.id} (${new Date(chat.updatedAt).toLocaleString()})`
        )
      } else {
        const isSelected = i === menuSelectedIndex
        const marker = isSelected ? '>' : ' '
        console.log(`${marker} ${NEW_CHAT_OPTION}`)
      }
    }

    if (totalItems > CHATS_PER_PAGE) {
      console.log(
        `\nShowing ${startIndex + 1}-${endIndex} of ${totalItems} items`
      )
    }

    console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
  }

  process.stdin.on('data', (key: string) => {
    const ESC_KEY = '\u001B'
    const ENTER_KEY = '\r'
    const BACKSPACE_KEY = '\x7F'
    const SPACE_KEY = ' '

    if (key === ESC_KEY) {
      if (isReceivingResponse) {
        stopResponseRequested = true
        clearLine()
        console.log('\n[Response stopped by user]')
        isReceivingResponse = false
        promptUser()
      } else if (isInMenu) {
        isInMenu = false
        console.clear()
        console.log('Exiting. Manicode out!')
        process.exit(0)
      } else {
        initializeMenu()
      }
    } else if (isInMenu) {
      const chats = chatStorage.listChats()
      const totalItems = chats.length + 1 // +1 for the "New Chat" option
      const middleIndex = Math.floor(CHATS_PER_PAGE / 2)

      if (key === '\u001B[A') {
        // Up arrow
        if (menuSelectedIndex > 0) {
          menuSelectedIndex--
          if (menuSelectedIndex < menuOffset + middleIndex && menuOffset > 0) {
            menuOffset--
          }
        }
        displayMenu()
      } else if (key === '\u001B[B') {
        // Down arrow
        if (menuSelectedIndex < totalItems - 1) {
          menuSelectedIndex++
          if (
            menuSelectedIndex >= menuOffset + middleIndex &&
            menuOffset + CHATS_PER_PAGE < totalItems
          ) {
            menuOffset++
          }
        }
        displayMenu()
      } else if (key === SPACE_KEY) {
        if (menuSelectedIndex < chats.length) {
          currentChat = chats[menuSelectedIndex]
          isInMenu = false
          console.clear()
          console.log(`Switched to chat: ${currentChat.id}`)
          promptUser()
        } else {
          // Create a new chat
          currentChat = chatStorage.createChat()
          isInMenu = false
          console.clear()
          console.log(`Created new chat: ${currentChat.id}`)
          promptUser()
        }
      }
    } else if (key === ENTER_KEY) {
      console.log() // Move to the next line
      const input = inputBuffer.trim()
      inputBuffer = ''
      historyIndex = -1
      if (input) {
        history.unshift(input)
        handleUserInput(input).then(promptUser)
      } else {
        promptUser()
      }
    } else if (key === BACKSPACE_KEY) {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1)
        refreshLine()
      }
    } else if (key === '\u001B[A' || key === '\u001B[B') {
      // Up or Down arrow
      if (key === '\u001B[A' && historyIndex < history.length - 1) {
        historyIndex++
      } else if (key === '\u001B[B' && historyIndex > -1) {
        historyIndex--
      }

      if (historyIndex === -1) {
        inputBuffer = ''
      } else {
        inputBuffer = history[historyIndex]
      }
      refreshLine()
    } else {
      inputBuffer += key
      process.stdout.write(key)
    }
  })

  const handleUserInput = async (userInput: string) => {
    clearLine()
    process.stdout.write('...')

    const newMessage: Message = { role: 'user', content: userInput }
    chatStorage.addMessage(currentChat, newMessage)

    // Get updated file context
    const fileContext = getProjectFileContext()

    isReceivingResponse = true
    stopResponseRequested = false
    responseBuffer = ''

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
      chatStorage.addMessage(currentChat, assistantMessage)
    } else {
      const partialResponse = responseBuffer.trim()
      if (partialResponse) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: partialResponse + '\n[RESPONSE_STOPPED_BY_USER]',
        }
        chatStorage.addMessage(currentChat, assistantMessage)
      }
    }
  }

  function promptUser() {
    clearLine()
    process.stdout.write('> ')
  }

  if (userPrompt) {
    await handleUserInput(userPrompt)
    promptUser()
  } else {
    promptUser()
  }
}

async function sendUserInputAndAwaitResponse(
  ws: APIRealtimeClient,
  messageHistory: Message[],
  fileContext: ProjectFileContext,
  isStopRequested: () => boolean
) {
  return await new Promise<string>((resolve) => {
    const unsubscribe = ws.subscribe('response-chunk', (a) => {
      const { chunk } = a

      if (isStopRequested()) {
        unsubscribe()
        resolve(responseBuffer)
        return
      }

      process.stdout.write(chunk)
      responseBuffer += chunk

      if (responseBuffer.includes(STOP_MARKER)) {
        unsubscribe()
        responseBuffer = responseBuffer.replace(STOP_MARKER, '').trim()
        console.log()
        resolve(responseBuffer)
      }
    })

    ws.sendAction({
      type: 'user-input',
      messages: messageHistory,
      fileContext,
    })
  })
}
