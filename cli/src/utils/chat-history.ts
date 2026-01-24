import * as fs from 'fs'
import path from 'path'

import { getProjectDataDir } from '../project-files'
import { logger } from './logger'

import type { ChatMessage } from '../types/chat'

export interface ChatHistoryEntry {
  chatId: string
  lastPrompt: string
  timestamp: Date
  messageCount: number
}

/**
 * Get the first user message from a list of chat messages
 */
function getFirstUserPrompt(messages: ChatMessage[]): string {
  for (const msg of messages) {
    if (msg?.variant === 'user' && msg.content) {
      // Truncate long prompts
      const content = msg.content.trim()
      if (content.length > 100) {
        return content.slice(0, 97) + '...'
      }
      return content
    }
  }
  return '(empty chat)'
}

interface ChatDirInfo {
  chatId: string
  chatPath: string
  messagesPath: string
  mtime: Date
}

/**
 * List all available chats sorted by most recent first
 * @param maxChats - Maximum number of chats to load (default: 500)
 */
export function getAllChats(maxChats: number = 500): ChatHistoryEntry[] {
  try {
    const chatsDir = path.join(getProjectDataDir(), 'chats')
    
    if (!fs.existsSync(chatsDir)) {
      return []
    }

    const chatDirs = fs.readdirSync(chatsDir)
    
    // First pass: get mtime for all chat directories (fast, no file reading)
    const chatDirInfos: ChatDirInfo[] = []
    for (const chatId of chatDirs) {
      const chatPath = path.join(chatsDir, chatId)
      try {
        const stat = fs.statSync(chatPath)
        if (!stat.isDirectory()) continue
        
        chatDirInfos.push({
          chatId,
          chatPath,
          messagesPath: path.join(chatPath, 'chat-messages.json'),
          mtime: stat.mtime,
        })
      } catch {
        // Skip directories we can't stat
      }
    }
    
    // Sort by mtime first (most recent first)
    chatDirInfos.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    
    // Second pass: only read message content for the top N chats
    const chats: ChatHistoryEntry[] = []
    const chatsToLoad = chatDirInfos.slice(0, maxChats)
    
    for (const info of chatsToLoad) {
      try {
        let messageCount = 0
        let lastPrompt = '(empty chat)'

        if (fs.existsSync(info.messagesPath)) {
          const content = fs.readFileSync(info.messagesPath, 'utf8')
          const messages = JSON.parse(content) as ChatMessage[]
          messageCount = messages.length
          lastPrompt = getFirstUserPrompt(messages)
        }

        // Skip empty chats (no messages)
        if (messageCount > 0) {
          chats.push({
            chatId: info.chatId,
            lastPrompt,
            timestamp: info.mtime,
            messageCount,
          })
        }
      } catch (error) {
        logger.debug(
          { chatId: info.chatId, error: error instanceof Error ? error.message : String(error) },
          'Failed to read chat messages'
        )
      }
    }

    return chats
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to list chats'
    )
    return []
  }
}

/**
 * Format a timestamp relative to now (e.g., "2 hours ago", "yesterday")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return 'just now'
  } else if (diffMins < 60) {
    return `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else if (diffDays === 1) {
    return 'yesterday'
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return date.toLocaleDateString()
  }
}
