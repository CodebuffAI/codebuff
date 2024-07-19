// @ts-nocheck
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

// ... (keep the existing code until the initializeMenu function)

  const initializeMenu = () => {
    const chats = chatStorage.listChats()
    const totalItems = chats.length + 1 // +1 for the NEW_CHAT_OPTION
    const middleIndex = Math.floor(CHATS_PER_PAGE / 2)

    const currentChatIndex = chats.findIndex(chat => chat.id === currentChat.id)

    if (currentChatIndex !== -1) {
      menuSelectedIndex = currentChatIndex
    } else {
      menuSelectedIndex = Math.min(middleIndex, totalItems - 1)
    }

    menuOffset = Math.max(0, Math.min(menuSelectedIndex - middleIndex, totalItems - CHATS_PER_PAGE))

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
        console.log(`${marker} ${chat.id} (${new Date(chat.updatedAt).toLocaleString()})`)
      } else {
        const isSelected = i === menuSelectedIndex
        const marker = isSelected ? '>' : ' '
        console.log(`${marker} ${NEW_CHAT_OPTION}`)
      }
    }

    if (totalItems > CHATS_PER_PAGE) {
      console.log(`\nShowing ${startIndex + 1}-${endIndex} of ${totalItems} items`)
    }

    console.log('\nUse arrow keys to navigate, SPACE to select, ESC to exit')
  }

  process.stdin.on('data', (key: string) => {
    // ... (keep the existing code)

    } else if (isInMenu) {
      const chats = chatStorage.listChats()
      const totalItems = chats.length + 1 // +1 for the "New Chat" option
      const middleIndex = Math.floor(CHATS_PER_PAGE / 2)

      if (key === '\u001B[A') { // Up arrow
        if (menuSelectedIndex > 0) {
          menuSelectedIndex--
          if (menuSelectedIndex < menuOffset + middleIndex && menuOffset > 0) {
            menuOffset--
          }
        }
        displayMenu()
      } else if (key === '\u001B[B') { // Down arrow
        if (menuSelectedIndex < totalItems - 1) {
          menuSelectedIndex++
          if (menuSelectedIndex >= menuOffset + middleIndex && menuOffset + CHATS_PER_PAGE < totalItems) {
            menuOffset++
          }
        }
        displayMenu()
      } else if (key === SPACE_KEY) {
        // ... (keep the existing code)
      }
    } else if (key === ENTER_KEY) {
      // ... (keep the existing code)
    }
  })

  // ... (keep the rest of the existing code)
}

// ... (keep the rest of the file unchanged)