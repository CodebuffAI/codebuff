/**
 * Message-level helpers for send-message logic.
 * These functions operate on ChatMessage objects, not raw blocks.
 * For block-level operations, import from message-block-helpers.ts or block-operations.ts.
 */

import { has } from 'lodash'

import { markRunningAgentsAsCancelled } from './block-operations'
import { shouldHideAgent } from './constants'
import { formatTimestamp } from './helpers'
import {
  appendInterruptionNotice,
  autoCollapseBlocks,
  createAgentBlock,
} from './message-block-helpers'

import type { AgentMode } from './constants'
import type {
  ChatMessage,
  ContentBlock,
} from '../types/chat'

// -----------------------------------------------------------------------------
// Message Creation Helpers
// -----------------------------------------------------------------------------

export const createModeDividerMessage = (agentMode: AgentMode): ChatMessage => ({
  id: `divider-${Date.now()}`,
  variant: 'ai',
  content: '',
  blocks: [
    {
      type: 'mode-divider',
      mode: agentMode,
    },
  ],
  timestamp: formatTimestamp(),
})

export const createAiMessageShell = (messageId: string): ChatMessage => ({
  id: messageId,
  variant: 'ai',
  content: '',
  blocks: [],
  timestamp: formatTimestamp(),
})

export const createErrorMessage = (content: string): ChatMessage => ({
  id: `error-${Date.now()}`,
  variant: 'error',
  content,
  timestamp: formatTimestamp(),
})

/** Id prefix identifying streamed AI response shells; shared with
 * sanitizeRestoredMessages so the two can't silently drift apart. */
export const AI_MESSAGE_ID_PREFIX = 'ai-'

export const generateAiMessageId = (): string =>
  `${AI_MESSAGE_ID_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}`

/**
 * A restored chat may contain an AI response that was still streaming when the
 * process died (checkpoint saves persist in-flight turns). Mark it complete
 * with an interruption notice so it doesn't render as still in progress.
 * Only touches streamed response shells (ids from generateAiMessageId) —
 * other 'ai'-variant messages (mode dividers, system notices, bash results)
 * are never marked complete by design.
 */
export const sanitizeRestoredMessages = (
  messages: ChatMessage[],
): ChatMessage[] =>
  messages.map((message) => {
    if (
      message.variant !== 'ai' ||
      !message.id.startsWith(AI_MESSAGE_ID_PREFIX) ||
      message.isComplete
    ) {
      return message
    }
    try {
      return {
        ...message,
        isComplete: true,
        blocks: appendInterruptionNotice(
          markRunningAgentsAsCancelled(message.blocks ?? []),
        ),
      }
    } catch {
      // Corrupted persisted blocks (e.g. null entries) must not prevent the
      // chat from restoring; keep the message as-is.
      return { ...message, isComplete: true }
    }
  })

// -----------------------------------------------------------------------------
// Auto-Collapse Logic
// -----------------------------------------------------------------------------

export const autoCollapsePreviousMessages = (
  messages: ChatMessage[],
  currentAiMessageId: string,
): ChatMessage[] =>
  messages.map((message) => {
    if (message.id === currentAiMessageId) {
      return message
    }

    if (message.variant === 'agent') {
      const userOpened = message.metadata?.userOpened ?? false
      return userOpened
        ? message
        : {
            ...message,
            metadata: {
              ...message.metadata,
              isCollapsed: true,
            },
          }
    }

    if (!message.blocks) {
      return message
    }

    return {
      ...message,
      blocks: autoCollapseBlocks(message.blocks),
    }
  })

// -----------------------------------------------------------------------------
// Spawn Agents Helpers
// -----------------------------------------------------------------------------

export const createSpawnAgentBlocks = (
  toolCallId: string,
  agents: Array<{ agent_type?: string; prompt?: string }>,
): ContentBlock[] =>
  agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => !shouldHideAgent(agent.agent_type || ''))
    .map(({ agent, index }) =>
      createAgentBlock({
        agentId: `${toolCallId}-${index}`,
        agentType: agent.agent_type || '',
        prompt: agent.prompt,
      }),
    )

export const isSpawnAgentsResult = (outputValue: unknown): boolean =>
  Array.isArray(outputValue) &&
  outputValue.some((v: unknown) => {
    if (typeof v !== 'object' || v === null) return false
    return has(v, 'agentName') || has(v, 'agentType')
  })

// -----------------------------------------------------------------------------
// Message Completion Helpers
// -----------------------------------------------------------------------------

export const markMessageComplete = (
  message: ChatMessage,
  options?: {
    completionTime?: string
    credits?: number
    runState?: unknown
  },
): ChatMessage => {
  const metadata = {
    ...(message.metadata ?? {}),
    ...(options?.runState ? { runState: options.runState } : {}),
  }
  return {
    ...message,
    isComplete: true,
    ...(options?.completionTime ? { completionTime: options.completionTime } : {}),
    ...(options?.credits !== undefined ? { credits: options.credits } : {}),
    metadata,
  }
}

export const setMessageError = (
  message: ChatMessage,
  errorContent: string,
): ChatMessage => ({
  ...message,
  content: errorContent,
  blocks: undefined,
  isComplete: true,
})
