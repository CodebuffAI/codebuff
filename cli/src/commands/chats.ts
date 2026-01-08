import * as fs from 'fs'
import path from 'path'

import { getAllChatDirs, getProjectDataDir, setCurrentChatId, startNewChat } from '../project-files'
import { useChatStore } from '../state/chat-store'
import {
  generateChatTitle,
  formatRelativeDate,
  getLastUserPrompt,
} from '../utils/chat-title-generator'
import { loadMostRecentChatState, saveChatState } from '../utils/run-state-storage'

import type { ChatMessage } from '../types/chat'
import type { RouterParams } from './command-registry'

export type ChatMetadata = {
  chatId: string
  title: string
  lastPrompt: string
  timestamp: string
  messageCount: number
  formattedDate: string
}

/**
 * Load metadata for a specific chat
 * Returns null if the chat doesn't exist or can't be loaded
 */
export function loadChatMetadata(chatId: string): ChatMetadata | null {
  try {
    const chatsDir = path.join(getProjectDataDir(), 'chats', chatId)

    // Try both file names (chat-messages.json is newer format)
    const messagesPath = fs.existsSync(path.join(chatsDir, 'chat-messages.json'))
      ? path.join(chatsDir, 'chat-messages.json')
      : path.join(chatsDir, 'messages.json')

    if (!fs.existsSync(messagesPath)) {
      return null
    }

    const messagesContent = fs.readFileSync(messagesPath, 'utf8')
    const messages = JSON.parse(messagesContent) as ChatMessage[]

    if (messages.length === 0) {
      return null
    }

    // Extract metadata
    const title = generateChatTitle(messages)
    const lastPrompt = getLastUserPrompt(messages)
    // chatId is an ISO timestamp, convert it to ISO format by replacing hyphens with colons in the time part
    // const timestamp = chatId.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3')
    const timestamp = messages[0]?.timestamp || new Date().toISOString()
    const messageCount = messages.length
    const formattedDate = formatRelativeDate(timestamp)

    return {
      chatId,
      title,
      lastPrompt,
      timestamp,
      messageCount,
      formattedDate,
    }
  } catch (error) {
    // Silently skip corrupted chats
    return null
  }
}

/**
 * Get metadata for all chats, sorted by most recent first
 */
export function getAllChatsMetadata(): ChatMetadata[] {
  const chatDirs = getAllChatDirs()

  const metadata = chatDirs
    .map((dir) => loadChatMetadata(dir.chatId))
    .filter((meta): meta is ChatMetadata => meta !== null)

  // Sort by timestamp descending (most recent first)
  metadata.sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime()
    const bTime = new Date(b.timestamp).getTime()
    return bTime - aTime
  })

  return metadata
}

/**
 * Command handler for /chats
 * Opens the chat picker screen
 */
export async function handleChatsCommand(params: RouterParams): Promise<void> {
  // Save current command to history
  params.saveToHistory(params.inputValue.trim())

  // Clear input
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

  // Set chat picker mode/state
  useChatStore.getState().setShowChatPicker(true)
}

/**
 * Handle selection of a chat from the chat picker
 */
export async function handleChatSelection(
  chatId: string,
  params: RouterParams,
): Promise<void> {
  try {
    // Save current chat state before switching
    const currentMessages = useChatStore.getState().messages
    const currentRunState = useChatStore.getState().runState
    if (currentMessages.length > 0 && currentRunState) {
      saveChatState(currentRunState, currentMessages)
    }

    // Start a new chat session (generate new chat ID)
    startNewChat()

    // Load selected chat
    const savedState = loadMostRecentChatState(chatId)

    if (!savedState) {
      throw new Error('Failed to load chat')
    }

    // Update state with loaded chat
    params.setMessages(() => savedState.messages)
    useChatStore.getState().setRunState(savedState.runState)

    // Update current chat ID to the loaded chat
    setCurrentChatId(chatId)

    // Close chat picker
    useChatStore.getState().setShowChatPicker(false)
  } catch (error) {
    console.error('Error resuming chat:', error)

    // Show error to user
    params.setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        variant: 'error',
        content: 'Failed to resume chat. Please try again.',
        timestamp: new Date().toISOString(),
      },
    ])

    // Close chat picker
    useChatStore.getState().setShowChatPicker(false)
  }
}
