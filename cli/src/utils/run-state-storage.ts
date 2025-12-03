import * as fs from 'fs'
import path from 'path'

import { getCurrentChatDir, getMostRecentChatDir, getProjectDataDir } from '../project-files'
import { logger } from './logger'

import type { ChatMessage, ContentBlock } from '../types/chat'
import type { RunState } from '@codebuff/sdk'

const RUN_STATE_FILENAME = 'run-state.json'
const CHAT_MESSAGES_FILENAME = 'chat-messages.json'

type SavedChatState = {
  runState: RunState
  messages: ChatMessage[]
  chatId?: string
}

/**
 * Recursively extract all agent IDs and tool call IDs from content blocks
 */
function extractToggleIds(blocks: ContentBlock[] | undefined): string[] {
  if (!blocks) return []
  
  const ids: string[] = []
  
  for (const block of blocks) {
    if (block.type === 'agent') {
      ids.push(block.agentId)
      // Recursively extract from nested blocks
      ids.push(...extractToggleIds(block.blocks))
    } else if (block.type === 'tool') {
      ids.push(block.toolCallId)
    }
  }
  
  return ids
}

/**
 * Get all toggle IDs (agent IDs and tool call IDs) from chat messages
 */
export function getAllToggleIdsFromMessages(messages: ChatMessage[]): string[] {
  const ids: string[] = []
  
  for (const message of messages) {
    ids.push(...extractToggleIds(message.blocks))
  }
  
  return ids
}

/**
 * Get the path to the run state file for the current chat
 */
export function getRunStatePath(): string {
  const chatDir = getCurrentChatDir()
  return path.join(chatDir, RUN_STATE_FILENAME)
}

/**
 * Get the path to the chat messages file for the current chat
 */
export function getChatMessagesPath(): string {
  const chatDir = getCurrentChatDir()
  return path.join(chatDir, CHAT_MESSAGES_FILENAME)
}

/**
 * Save both the RunState and ChatMessage[] to disk
 */
export function saveChatState(runState: RunState, messages: ChatMessage[]): void {
  try {
    const runStatePath = getRunStatePath()
    const messagesPath = getChatMessagesPath()
    
    fs.writeFileSync(runStatePath, JSON.stringify(runState, null, 2))
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2))
    
    logger.debug(
      { runStatePath, messagesPath, messageCount: messages.length },
      'Saved chat state to disk'
    )
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to save chat state',
    )
  }
}

/**
 * Load both RunState and ChatMessage[] from a specific chat directory or the most recent one.
 * When chatId is provided, it is used to locate the chat directory; otherwise the most
 * recently modified chat directory is used.
 * Returns null if no previous chat exists or files can't be parsed.
 */
export function loadMostRecentChatState(chatId?: string): SavedChatState | null {
  try {
    let chatDir: string | null = null

    if (chatId && chatId.trim().length > 0) {
      const baseDir = path.join(getProjectDataDir(), 'chats')
      const candidateDir = path.join(baseDir, chatId.trim())
      if (fs.existsSync(candidateDir) && fs.statSync(candidateDir).isDirectory()) {
        chatDir = candidateDir
      } else {
        logger.debug(
          { candidateDir, chatId },
          'Requested chatId directory not found, falling back to most recent chat directory',
        )
      }
    }

    if (!chatDir) {
      chatDir = getMostRecentChatDir()
    }

    if (!chatDir) {
      logger.debug('No previous chat directory found')
      return null
    }

    const runStatePath = path.join(chatDir, RUN_STATE_FILENAME)
    const messagesPath = path.join(chatDir, CHAT_MESSAGES_FILENAME)

    if (!fs.existsSync(runStatePath) || !fs.existsSync(messagesPath)) {
      logger.debug(
        { runStatePath, messagesPath },
        'Missing state files in chat directory',
      )
      return null
    }

    const runStateContent = fs.readFileSync(runStatePath, 'utf8')
    const messagesContent = fs.readFileSync(messagesPath, 'utf8')

    const runState = JSON.parse(runStateContent) as RunState
    const messages = JSON.parse(messagesContent) as ChatMessage[]

    const resolvedChatId = path.basename(chatDir)

    logger.info(
      { runStatePath, messagesPath, messageCount: messages.length, chatId: resolvedChatId },
      'Loaded chat state from chat directory',
    )

    return { runState, messages, chatId: resolvedChatId }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to load chat state',
    )
    return null
  }
}

/**
 * Clear the saved state files
 */
export function clearChatState(): void {
  try {
    const runStatePath = getRunStatePath()
    const messagesPath = getChatMessagesPath()
    
    if (fs.existsSync(runStatePath)) {
      fs.unlinkSync(runStatePath)
    }
    if (fs.existsSync(messagesPath)) {
      fs.unlinkSync(messagesPath)
    }
    
    logger.debug(
      { runStatePath, messagesPath },
      'Cleared chat state files'
    )
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to clear chat state',
    )
  }
}
