import fs from 'fs'
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

const MAX_HISTORY_SIZE = 1000
export const MESSAGE_HISTORY_COMPACT_THRESHOLD_BYTES = 256 * 1024
const MESSAGE_HISTORY_LOCK_STALE_MS = 30_000

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
export const getMessageHistoryPath = (): string => {
  return path.join(getConfigDir(), 'message-history.json')
}

export const getMessageHistoryJournalPath = (): string =>
  path.join(getConfigDir(), 'message-history.jsonl')

const getMessageHistoryLockPath = (): string =>
  path.join(getConfigDir(), 'message-history.lock')

function withMessageHistoryLock<T>(operation: () => T): T {
  const lockPath = getMessageHistoryLockPath()
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  let lockFd: number | undefined
  try {
    const waitState = new Int32Array(new SharedArrayBuffer(4))
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        lockFd = fs.openSync(lockPath, 'wx', 0o600)
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EEXIST') throw error
        try {
          const lockAge = Date.now() - fs.statSync(lockPath).mtimeMs
          if (lockAge > MESSAGE_HISTORY_LOCK_STALE_MS) {
            fs.unlinkSync(lockPath)
            continue
          }
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw statError
        }
        if (attempt === 49) {
          throw new Error('Message history is busy in another Openbuff process')
        }
        Atomics.wait(waitState, 0, 0, 10)
      }
    }
    if (lockFd === undefined) throw new Error('Failed to acquire message history lock')
    return operation()
  } finally {
    if (lockFd !== undefined) {
      fs.closeSync(lockFd)
      try {
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath)
      } catch {
        // A later operation can recover a stale lock.
      }
    }
  }
}

function writeHistorySnapshot(history: string[]): void {
  const historyPath = getMessageHistoryPath()
  const temporaryPath = `${historyPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(history, null, 2), {
    mode: 0o600,
  })
  fs.renameSync(temporaryPath, historyPath)
}

function compactMessageHistory(): void {
  const journalPath = getMessageHistoryJournalPath()
  const history = loadMessageHistoryUnlocked()
  writeHistorySnapshot(history)
  const temporaryJournalPath = `${journalPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporaryJournalPath, '', { mode: 0o600 })
  fs.renameSync(temporaryJournalPath, journalPath)
}

/**
 * Load message history from file system
 * @returns Array of previous messages, most recent last
 */
const loadMessageHistoryUnlocked = (): string[] => {
  const historyPath = getMessageHistoryPath()
  const journalPath = getMessageHistoryJournalPath()

  let history: string[] = []
  if (fs.existsSync(historyPath)) {
    try {
      const historyFile = fs.readFileSync(historyPath, 'utf8')
      const parsed = JSON.parse(historyFile)
      if (Array.isArray(parsed)) {
        history = parsed.filter((item) => typeof item === 'string')
      } else {
        logger.warn('Message history file has invalid format, ignoring it')
      }
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Ignoring malformed legacy message history',
      )
    }
  }
  if (fs.existsSync(journalPath)) {
    try {
      for (const line of fs.readFileSync(journalPath, 'utf8').split('\n')) {
        if (!line) continue
        try {
          const item: unknown = JSON.parse(line)
          if (typeof item === 'string') history.push(item)
        } catch {
          logger.warn('Ignoring malformed message history journal entry')
        }
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error reading message history journal',
      )
    }
  }
  return history.slice(-MAX_HISTORY_SIZE)
}

export const loadMessageHistory = (): string[] =>
  withMessageHistoryLock(loadMessageHistoryUnlocked)

/**
 * Append one prompt using O_APPEND. This avoids the cross-terminal lost-update
 * race inherent in read/modify/rename of a shared JSON array.
 */
export const appendMessageHistory = (message: string): void => {
  const configDir = getConfigDir()
  try {
    withMessageHistoryLock(() => {
      fs.mkdirSync(configDir, { recursive: true })
      const journalPath = getMessageHistoryJournalPath()
      fs.appendFileSync(journalPath, `${JSON.stringify(message)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      if (
        fs.statSync(journalPath).size >=
        MESSAGE_HISTORY_COMPACT_THRESHOLD_BYTES
      ) {
        compactMessageHistory()
      }
    })
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error appending message history',
    )
  }
}

/**
 * Save message history to file system
 */
export const saveMessageHistory = (history: string[]): void => {
  const configDir = getConfigDir()

  try {
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // Limit history size to prevent file from growing too large
    const limitedHistory =
      history.length > MAX_HISTORY_SIZE
        ? history.slice(history.length - MAX_HISTORY_SIZE)
        : history

    withMessageHistoryLock(() => {
      writeHistorySnapshot(limitedHistory)
      const journalPath = getMessageHistoryJournalPath()
      const temporaryJournalPath = `${journalPath}.${process.pid}.${crypto.randomUUID()}.tmp`
      fs.writeFileSync(temporaryJournalPath, '', { mode: 0o600 })
      fs.renameSync(temporaryJournalPath, journalPath)
    })
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

/**
 * Clear message history from file system
 */
export const clearMessageHistory = (): void => {
  const historyPaths = [getMessageHistoryPath(), getMessageHistoryJournalPath()]

  try {
    for (const historyPath of historyPaths) {
      if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath)
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
