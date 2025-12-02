/**
 * Message-level helpers for send-message logic.
 * These functions operate on ChatMessage objects, not raw blocks.
 * For block-level operations, import from message-block-helpers.ts or block-operations.ts.
 */

import { has } from 'lodash'

import { shouldHideAgent } from './constants'
import { formatTimestamp } from './helpers'
import { autoCollapseBlocks , createAgentBlock } from './message-block-helpers'

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

export const generateAiMessageId = (): string =>
  `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`

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
