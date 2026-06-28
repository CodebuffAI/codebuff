import * as fs from 'fs'
import path from 'path'

import { getCurrentChatDir, getMostRecentChatDir, getProjectDataDir } from '../project-files'
import { logger } from './logger'
import { sanitizeForChatPersistence } from './payload-sanitizer'

import type { ChatMessage, ContentBlock } from '../types/chat'
import type { RunState } from '@openbuff/sdk'
import type {
  AgentState,
  SessionState,
} from '@codebuff/common/types/session-state'

const RUN_STATE_FILENAME = 'run-state.json'
const CHAT_MESSAGES_FILENAME = 'chat-messages.json'
const CHECKPOINT_FILENAME = 'turn-checkpoint.json'

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
 * P2-3: Get the path to the mid-turn checkpoint file for the current chat.
 * The checkpoint stores a serialized mainAgentState snapshot taken every
 * ~30s during the main agent loop, so a crashed/killed session can resume
 * mid-turn from the last checkpoint rather than losing all in-flight work.
 */
export function getCheckpointPath(): string {
  const chatDir = getCurrentChatDir()
  return path.join(chatDir, CHECKPOINT_FILENAME)
}


/**
 * Save both the RunState and ChatMessage[] to disk
 */
export function saveChatState(runState: RunState, messages: ChatMessage[]): void {
  try {
    const runStatePath = getRunStatePath()
    const messagesPath = getChatMessagesPath()
    const persistedRunState = sanitizeForChatPersistence(runState)
    const persistedMessages = sanitizeForChatPersistence(messages)
    
    fs.writeFileSync(runStatePath, JSON.stringify(persistedRunState, null, 2))
    fs.writeFileSync(messagesPath, JSON.stringify(persistedMessages, null, 2))
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

    const runState = sanitizeForChatPersistence(
      JSON.parse(runStateContent) as RunState,
    )
    const messages = sanitizeForChatPersistence(
      JSON.parse(messagesContent) as ChatMessage[],
    )

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
 * P2-3: Wrapper for a mid-turn checkpoint. Contains the serialized
 * mainAgentState snapshot plus the `checkpointTurnId` (the userInputId/promptId
 * of the interrupted turn) so the CLI can self-validate on resume that the
 * checkpoint belongs to the turn it's about to resume — a stale checkpoint from
 * a *previous* turn is discarded rather than corrupting the new turn.
 */
export type TurnCheckpoint = {
  /** The promptId/userInputId of the turn this checkpoint was written for.
   * On resume, the CLI compares this against the turn it's about to resume;
   * mismatch = discard the checkpoint and start fresh. */
  checkpointTurnId: string
  /** Unix ms of the last checkpoint write, for staleness diagnostics. */
  checkpointTime: number
  /** The main agent's state snapshot at the last step boundary. */
  mainAgentState: SessionState['mainAgentState']
}

/**
 * P2-3: Save a mid-turn checkpoint atomically (temp file + rename). Called by
 * the SDK's onCheckpoint callback (throttled to 30s inside loopAgentSteps).
 * Failures are swallowed and logged — checkpoint persistence must never kill
 * the run (loopAgentSteps also catches, but we double-guard here since this
 * runs on the CLI's filesystem).
 */
export function saveCheckpoint(
  checkpointTurnId: string,
  mainAgentState: AgentState,
): void {
  try {
    const checkpointPath = getCheckpointPath()
    const checkpoint: TurnCheckpoint = {
      checkpointTurnId,
      checkpointTime: Date.now(),
      mainAgentState: sanitizeForChatPersistence(mainAgentState),
    }
    const serialized = JSON.stringify(checkpoint, null, 2)
    // Atomic write: temp file in the same directory, then rename. Same-dir
    // rename is atomic on POSIX and prevents a partial-write checkpoint from
    // corrupting the resume path on a crash mid-write.
    const dir = path.dirname(checkpointPath)
    const tempPath = `${checkpointPath}.tmp.${process.pid}`
    // Sweep stale temp files from prior crashed writes (a previous pid that
    // died between writeFileSync and renameSync). Bounded to the checkpoint's
    // own directory and the `.tmp.` prefix so we never touch unrelated files.
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (
          entry.startsWith(`${CHECKPOINT_FILENAME}.tmp.`) &&
          entry !== path.basename(tempPath)
        ) {
          fs.unlinkSync(path.join(dir, entry))
        }
      }
    } catch {
      // Best-effort cleanup; a missing dir or race here must not block the
      // checkpoint write below.
    }
    fs.writeFileSync(tempPath, serialized)
    fs.renameSync(tempPath, checkpointPath)
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to save mid-turn checkpoint (non-fatal)',
    )
  }
}

/**
 * P2-3: Load the mid-turn checkpoint for validation. Returns null if no
 * checkpoint exists or it can't be parsed. The caller validates that
 * `checkpointTurnId` matches the turn it's about to resume before using the
 * snapshot; a mismatch means the checkpoint is stale (from a previous turn)
 * and must be discarded.
 */
export function loadCheckpoint(): TurnCheckpoint | null {
  try {
    const checkpointPath = getCheckpointPath()
    if (!fs.existsSync(checkpointPath)) {
      return null
    }
    const content = fs.readFileSync(checkpointPath, 'utf8')
    const checkpoint = sanitizeForChatPersistence(
      JSON.parse(content) as TurnCheckpoint,
    )
    if (
      !checkpoint ||
      typeof checkpoint.checkpointTurnId !== 'string' ||
      typeof checkpoint.checkpointTime !== 'number' ||
      !checkpoint.mainAgentState
    ) {
      logger.warn(
        { checkpointPath },
        'Mid-turn checkpoint is malformed, discarding',
      )
      return null
    }
    return checkpoint
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to load mid-turn checkpoint (non-fatal)',
    )
    return null
  }
}

/**
 * P2-3: Clear the mid-turn checkpoint. Called after a turn completes
 * successfully (so a stale checkpoint can't interfere with the next turn) and
 * when a checkpoint is rejected as stale on resume.
 */
export function clearCheckpoint(): void {
  try {
    const checkpointPath = getCheckpointPath()
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath)
      logger.debug({ checkpointPath }, 'Cleared mid-turn checkpoint')
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to clear mid-turn checkpoint (non-fatal)',
    )
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
