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

// ... (keep the existing code until the displayMenu function)

const displayMenu = () => {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalChats = chats.length

  if (totalChats === 0) {
    console.log('No chats available.')
    console.log(`\n${NEW_CHAT_OPTION}`)
    return
  }

  const visibleRange = 5 // Total number of chats to display (2 on each side + 1 selected)
  const halfRange = Math.floor(visibleRange / 2)

  let startIndex = Math.max(0, menuSelectedIndex - halfRange)
  let endIndex = Math.min(totalChats - 1, startIndex + visibleRange - 1)

  // Adjust startIndex if we're near the end of the list
  if (endIndex - startIndex < visibleRange - 1) {
    startIndex = Math.max(0, endIndex - visibleRange + 1)
  }

  if (startIndex > 0) {
    console.log('...')
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const chat = chats[i]
    const isSelected = i === menuSelectedIndex
    const marker = isSelected ? '>' : ' '
    console.log(
      `${marker} ${chat.id} (${new Date(chat.updatedAt).toLocaleString()})`
    )
  }

  if (endIndex < totalChats - 1) {
    console.log('...')
  }

  console.log(`\n${NEW_CHAT_OPTION}`)
  console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
}

const initializeMenu = () => {
  const chats = chatStorage.listChats()
  const currentChatIndex = chats.findIndex((chat) => chat.id === currentChat.id)

  if (currentChatIndex !== -1) {
    menuSelectedIndex = currentChatIndex
  } else {
    menuSelectedIndex = 0
  }

  isInMenu = true
  displayMenu()
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
    const totalChats = chats.length
    if (key === '\u001B[A') {
      // Up arrow
      if (menuSelectedIndex > 0) {
        menuSelectedIndex--
        displayMenu()
      }
    } else if (key === '\u001B[B') {
      // Down arrow
      if (menuSelectedIndex < totalChats - 1) {
        menuSelectedIndex++
        displayMenu()
      }
    } else if (key === SPACE_KEY) {
      if (menuSelectedIndex < totalChats) {
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

// ... (keep the rest of the file unchanged)
