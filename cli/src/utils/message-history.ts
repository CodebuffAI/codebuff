import fs from 'fs'
import { createHash } from 'node:crypto'
import path from 'path'

import { getConfigDir } from './auth'
import { formatTimestamp } from './helpers'
import { logger } from './logger'

import type {
  ChatMessage,
  ContentBlock,
  FileAttachment,
  ImageAttachment,
  TextAttachment,
} from '../types/chat'

const MAX_HISTORY_SIZE = 500
const HISTORY_SIZE_ENV_VAR = 'FREEBUFF_HISTORY_SIZE'
const HISTORY_SCOPE_ENV_VAR = 'FREEBUFF_HISTORY_SCOPE'

function getProjectHistoryDirName(projectRoot: string): string {
  const normalizedRoot = path.resolve(projectRoot)
  const safeBaseName = (path.basename(normalizedRoot) || 'project').replace(
    /[^a-zA-Z0-9._-]/g,
    '_',
  )
  const rootHash = createHash('sha256')
    .update(normalizedRoot)
    .digest('hex')
    .slice(0, 12)

  return `${safeBaseName}-${rootHash}`
}

export function getUserMessage(
  message: string | ContentBlock[],
  attachments?: ImageAttachment[],
  textAttachments?: TextAttachment[],
  fileAttachments?: FileAttachment[],
): ChatMessage {
  return {
    id: `user-${Date.now()}`,
    variant: 'user',
    ...(typeof message === 'string'
      ? {
          content: message,
        }
      : {
          content: '',
          blocks: message,
        }),
    timestamp: formatTimestamp(),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(textAttachments && textAttachments.length > 0
      ? { textAttachments }
      : {}),
    ...(fileAttachments && fileAttachments.length > 0
      ? { fileAttachments }
      : {}),
  }
}

export function getSystemMessage(
  content: string | ContentBlock[],
): ChatMessage {
  return {
    id: `sys-${Date.now()}`,
    variant: 'ai' as const,
    ...(typeof content === 'string'
      ? {
          content,
        }
      : {
          content: '',
          blocks: content,
        }),
    timestamp: formatTimestamp(),
  }
}

/**
 * Get the message history file path
 */
function getMessageHistoryLimit(): number {
  const value = process.env[HISTORY_SIZE_ENV_VAR]?.trim()
  if (value === undefined) {
    return MAX_HISTORY_SIZE
  }

  if (!/^\d+$/.test(value)) {
    return MAX_HISTORY_SIZE
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return MAX_HISTORY_SIZE
  }

  return parsed
}

function isMessageHistoryEnabled(): boolean {
  return getMessageHistoryLimit() !== 0
}

/**
 * Get the message history file path
 */
export const getMessageHistoryPath = (projectRoot?: string): string => {
  if (projectRoot && process.env[HISTORY_SCOPE_ENV_VAR] !== 'global') {
    return path.join(
      getConfigDir(),
      'projects',
      getProjectHistoryDirName(projectRoot),
      'message-history.json',
    )
  }

  return path.join(getConfigDir(), 'message-history.json')
}

/**
 * Load message history from file system
 * @returns Array of previous messages, most recent last
 */
export const loadMessageHistory = (projectRoot?: string): string[] => {
  if (!isMessageHistoryEnabled()) {
    return []
  }

  const historyPath = getMessageHistoryPath(projectRoot)

  if (!fs.existsSync(historyPath)) {
    return []
  }

  try {
    const historyFile = fs.readFileSync(historyPath, 'utf8')
    const history = JSON.parse(historyFile)

    if (!Array.isArray(history)) {
      logger.warn('Message history file has invalid format, resetting')
      return []
    }

    return history.filter((item) => typeof item === 'string')
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error reading message history',
    )
    return []
  }
}

/**
 * Save message history to file system
 */
export const saveMessageHistory = (
  history: string[],
  projectRoot?: string,
): void => {
  const historyLimit = getMessageHistoryLimit()
  if (historyLimit === 0) {
    return
  }

  const configDir = getConfigDir()
  const historyPath = getMessageHistoryPath(projectRoot)

  try {
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Limit history size to prevent file from growing too large
    const limitedHistory =
      history.length > historyLimit
        ? history.slice(history.length - historyLimit)
        : history

    // Save history
    const historyDir = path.dirname(historyPath)
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true })
    }
    fs.writeFileSync(historyPath, JSON.stringify(limitedHistory, null, 2))
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving message history',
    )
    // Don't throw - history persistence is not critical
  }
}

export const appendMessageHistory = (
  message: string,
  projectRoot?: string,
): string[] => {
  if (!isMessageHistoryEnabled()) {
    return []
  }

  const diskHistory = loadMessageHistory(projectRoot)
  const newHistory =
    diskHistory.at(-1) === message ? diskHistory : [...diskHistory, message]

  saveMessageHistory(newHistory, projectRoot)
  return newHistory
}

/**
 * Clear message history from file system
 */
export const clearMessageHistory = (projectRoot?: string): void => {
  const historyPath = getMessageHistoryPath(projectRoot)

  try {
    if (fs.existsSync(historyPath)) {
      fs.unlinkSync(historyPath)
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error clearing message history',
    )
  }
}
