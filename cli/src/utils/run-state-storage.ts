import * as fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'

import {
  getCurrentChatDir,
  getMostRecentChatDir,
  getProjectDataDir,
} from '../project-files'
import { logger } from './logger'
import { writeFileAtomic } from './write-file-atomic'

import type { ChatMessage, ContentBlock } from '../types/chat'
import type { RunState } from '@codebuff/sdk'

const RUN_STATE_FILENAME = 'run-state.json'
const CHAT_MESSAGES_FILENAME = 'chat-messages.json'

type SavedChatState = {
  runState: RunState
  messages: ChatMessage[]
  chatId?: string
}

type LiveChatState = {
  runState: RunState
  messages: ChatMessage[]
}

let liveChatStateProvider: {
  ownerId: string
  provide: () => LiveChatState | null
} | null = null

/**
 * Register a provider for the in-flight chat state. While a run is active,
 * exit paths call flushLiveChatState() to persist the latest checkpoint so a
 * quit/crash doesn't lose the turn. ownerId ties the provider to a specific
 * run so a stale run can't clear a newer run's provider.
 */
export function setLiveChatStateProvider(
  ownerId: string,
  provide: () => LiveChatState | null,
): void {
  liveChatStateProvider = { ownerId, provide }
}

export function clearLiveChatStateProvider(ownerId: string): void {
  if (liveChatStateProvider?.ownerId === ownerId) {
    liveChatStateProvider = null
  }
}

/**
 * Synchronously persist the in-flight chat state, if any. Safe to call from
 * process exit/signal handlers (saveChatState uses writeFileSync).
 */
export function flushLiveChatState(): void {
  try {
    const state = liveChatStateProvider?.provide()
    if (state) {
      saveChatState(state.runState, state.messages)
    }
  } catch {
    // Best-effort - never block process exit.
  }
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

// Test-only escape hatch: persistence normally resolves the chat directory
// through project-files (under the user's real config dir). Tests point it at
// a temp directory instead of mocking module internals — mock.module leaks
// across bun test files and os.homedir() ignores $HOME on macOS, so both of
// those seams are unreliable (see docs/testing.md: DI over module mocking).
let chatDirOverride: string | undefined

export function setChatDirOverrideForTesting(dir: string | undefined): void {
  chatDirOverride = dir
}

function resolveCurrentChatDir(): string {
  if (chatDirOverride) {
    fs.mkdirSync(chatDirOverride, { recursive: true })
    return chatDirOverride
  }
  return getCurrentChatDir()
}

/**
 * Get the path to the run state file for the current chat
 */
export function getRunStatePath(): string {
  const chatDir = resolveCurrentChatDir()
  return path.join(chatDir, RUN_STATE_FILENAME)
}

/**
 * Get the path to the chat messages file for the current chat
 */
export function getChatMessagesPath(): string {
  const chatDir = resolveCurrentChatDir()
  return path.join(chatDir, CHAT_MESSAGES_FILENAME)
}

/**
 * Save both the RunState and ChatMessage[] to disk
 */
export function saveChatState(
  runState: RunState,
  messages: ChatMessage[],
): void {
  try {
    const runStatePath = getRunStatePath()
    const messagesPath = getChatMessagesPath()

    // Compact JSON: these files are rewritten on every checkpoint and grow to
    // multiple MB; pretty-printing roughly doubles the write.
    writeFileAtomic(runStatePath, JSON.stringify(runState))
    writeFileAtomic(messagesPath, JSON.stringify(messages))
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
export function loadMostRecentChatState(
  chatId?: string,
): SavedChatState | null {
  try {
    let chatDir: string | null = chatDirOverride ?? null

    if (!chatDir && chatId && chatId.trim().length > 0) {
      const baseDir = path.join(getProjectDataDir(), 'chats')
      const candidateDir = path.join(baseDir, chatId.trim())
      if (
        fs.existsSync(candidateDir) &&
        fs.statSync(candidateDir).isDirectory()
      ) {
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

    // Parse the two files independently: a missing or torn run-state.json
    // must not lose the transcript, and vice versa. Restore whatever is
    // readable and fall back for the rest.
    let runState: RunState | null = null
    try {
      runState = JSON.parse(
        fs.readFileSync(runStatePath, 'utf8'),
      ) as RunState
    } catch (error) {
      logger.warn(
        {
          runStatePath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Could not read run state; restoring transcript without agent context',
      )
    }

    let messages: ChatMessage[] | null = null
    try {
      messages = JSON.parse(
        fs.readFileSync(messagesPath, 'utf8'),
      ) as ChatMessage[]
    } catch (error) {
      logger.warn(
        {
          messagesPath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Could not read chat messages; restoring agent context without transcript',
      )
    }

    if (!runState && !messages) {
      logger.debug(
        { runStatePath, messagesPath },
        'No readable state files in chat directory',
      )
      return null
    }

    runState ??= {
      output: {
        type: 'error',
        message: 'Previous run state could not be restored.',
      },
    } as RunState
    runState.traceSessionId ??= randomUUID()
    messages ??= []

    const resolvedChatId = path.basename(chatDir)

    logger.info(
      {
        runStatePath,
        messagesPath,
        messageCount: messages.length,
        chatId: resolvedChatId,
      },
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

    logger.debug({ runStatePath, messagesPath }, 'Cleared chat state files')
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to clear chat state',
    )
  }
}
