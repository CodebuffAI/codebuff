import { ChatStorage } from './chat-storage'

const NEW_CHAT_OPTION = '+ New chat'
const CHATS_PER_PAGE = 5

interface MenuState {
  menuSelectedIndex: number
  menuOffset: number
}

let menuState: MenuState = {
  menuSelectedIndex: 0,
  menuOffset: 0
}

export function displayMenu(chatStorage: ChatStorage) {
  console.clear()
  console.log('Chat History:')
  const chats = chatStorage.listChats()
  const totalItems = chats.length + 1 // +1 for the "New Chat" option
  const { menuOffset, menuSelectedIndex } = menuState
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

export function initializeMenu(chatStorage: ChatStorage) {
  const chats = chatStorage.listChats()
  const currentChatIndex = chats.findIndex(
    (chat) => chat.id === chatStorage.getCurrentChat().id
  )

  if (currentChatIndex !== -1) {
    menuState.menuSelectedIndex = currentChatIndex
    menuState.menuOffset = Math.max(
      0,
      Math.min(currentChatIndex, chats.length - CHATS_PER_PAGE + 1)
    )
  } else {
    menuState.menuSelectedIndex = 0
    menuState.menuOffset = 0
  }

  displayMenu(chatStorage)
}

export function navigateMenu(chatStorage: ChatStorage, key: string) {
  const chats = chatStorage.listChats()
  const totalItems = chats.length + 1 // +1 for the "New Chat" option

  if (key === '\u001B[A') {
    // Up arrow
    if (menuState.menuSelectedIndex > menuState.menuOffset) {
      menuState.menuSelectedIndex--
    } else if (menuState.menuOffset > 0) {
      menuState.menuOffset--
      menuState.menuSelectedIndex--
    }
  } else if (key === '\u001B[B') {
    // Down arrow
    if (
      menuState.menuSelectedIndex <
      Math.min(menuState.menuOffset + CHATS_PER_PAGE - 1, totalItems - 1)
    ) {
      menuState.menuSelectedIndex++
    } else if (menuState.menuOffset + CHATS_PER_PAGE < totalItems) {
      menuState.menuOffset++
      menuState.menuSelectedIndex++
    }
  }
}

export function selectChat(chatStorage: ChatStorage): string | null {
  const chats = chatStorage.listChats()
  if (menuState.menuSelectedIndex < chats.length) {
    const selectedChat = chats[menuState.menuSelectedIndex]
    return selectedChat.id
  }
  return null
}
