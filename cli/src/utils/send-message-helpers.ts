/**
 * Pure helper functions for send-message logic.
 * These functions are extracted to enable unit testing without React dependencies.
 */

import { has } from 'lodash'

import { shouldCollapseByDefault, shouldHideAgent } from './constants'
import { formatTimestamp } from './helpers'

import type {
  ChatMessage,
  ContentBlock,
  AgentContentBlock,
  ToolContentBlock,
  AskUserContentBlock,
} from '../types/chat'
import type { AgentMode } from './constants'
import type { ToolName } from '@codebuff/sdk'

// ============================================================================
// Block Manipulation Helpers
// ============================================================================

/**
 * Recursively updates blocks matching a target agent ID.
 * Returns the original array reference if nothing changed (for React optimization).
 */
export const updateBlocksRecursively = (
  blocks: ContentBlock[],
  targetAgentId: string,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] => {
  let foundTarget = false
  const result = blocks.map((block) => {
    if (block.type === 'agent' && block.agentId === targetAgentId) {
      foundTarget = true
      return updateFn(block)
    }
    if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = updateBlocksRecursively(
        block.blocks,
        targetAgentId,
        updateFn,
      )
      // Only create new block if nested blocks actually changed
      if (updatedBlocks !== block.blocks) {
        foundTarget = true
        return {
          ...block,
          blocks: updatedBlocks,
        }
      }
    }
    return block
  })

  // Return original array reference if nothing changed
  return foundTarget ? result : blocks
}

/**
 * Removes <PLAN> tags from a string.
 * Handles both complete tags and incomplete trailing tags.
 */
export const scrubPlanTags = (s: string): string =>
  s.replace(/<PLAN>[\s\S]*?<\/cb_plan>/g, '').replace(/<PLAN>[\s\S]*$/g, '')

/**
 * Removes plan tags from all text blocks and filters out empty text blocks.
 */
export const scrubPlanTagsInBlocks = (blocks: ContentBlock[]): ContentBlock[] => {
  return blocks
    .map((b) => {
      if (b.type === 'text') {
        const newContent = scrubPlanTags(b.content)
        return {
          ...b,
          content: newContent,
        }
      }
      return b
    })
    .filter((b) => b.type !== 'text' || b.content.trim() !== '')
}

// ============================================================================
// Message Creation Helpers
// ============================================================================

/**
 * Creates a mode divider message for separating different agent modes in the chat.
 */
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

/**
 * Creates an empty AI message shell for streaming content into.
 */
export const createAiMessageShell = (messageId: string): ChatMessage => ({
  id: messageId,
  variant: 'ai',
  content: '',
  blocks: [],
  timestamp: formatTimestamp(),
})

/**
 * Creates an error message for display in the chat.
 */
export const createErrorMessage = (content: string): ChatMessage => ({
  id: `error-${Date.now()}`,
  variant: 'error',
  content,
  timestamp: formatTimestamp(),
})

/**
 * Generates a unique AI message ID.
 */
export const generateAiMessageId = (): string =>
  `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`

// ============================================================================
// Auto-Collapse Logic
// ============================================================================

/**
 * Recursively auto-collapses blocks that weren't manually opened by the user.
 */
export const autoCollapseBlocksRecursively = (
  blocks: ContentBlock[],
): ContentBlock[] => {
  return blocks.map((block) => {
    // Handle thinking blocks (grouped text blocks)
    if (block.type === 'text' && block.thinkingId) {
      return block.userOpened ? block : { ...block, isCollapsed: true }
    }

    // Handle agent blocks
    if (block.type === 'agent') {
      const updatedBlock = block.userOpened
        ? block
        : { ...block, isCollapsed: true }

      // Recursively update nested blocks
      if (updatedBlock.blocks) {
        return {
          ...updatedBlock,
          blocks: autoCollapseBlocksRecursively(updatedBlock.blocks),
        }
      }
      return updatedBlock
    }

    // Handle tool blocks
    if (block.type === 'tool') {
      return block.userOpened ? block : { ...block, isCollapsed: true }
    }

    // Handle agent-list blocks
    if (block.type === 'agent-list') {
      return block.userOpened ? block : { ...block, isCollapsed: true }
    }

    return block
  })
}

/**
 * Auto-collapses previous messages' toggles while respecting user-opened state.
 * Returns a new array with collapsed messages (except the current AI message).
 */
export const autoCollapsePreviousMessages = (
  messages: ChatMessage[],
  currentAiMessageId: string,
): ChatMessage[] => {
  return messages.map((message) => {
    // Don't collapse the message we just added
    if (message.id === currentAiMessageId) {
      return message
    }

    // Handle agent variant messages
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

    // Handle blocks within messages
    if (!message.blocks) return message

    return {
      ...message,
      blocks: autoCollapseBlocksRecursively(message.blocks),
    }
  })
}

// ============================================================================
// Stream Chunk Processing
// ============================================================================

export type StreamDelta =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }

/**
 * Appends a stream chunk to message blocks, merging with existing text blocks
 * of the same type or creating new ones.
 */
export const appendStreamChunkToBlocks = (
  blocks: ContentBlock[],
  delta: StreamDelta,
): ContentBlock[] => {
  if (!delta.text) {
    return blocks
  }

  const newBlocks = [...blocks]
  const lastBlock = newBlocks[newBlocks.length - 1]

  if (
    lastBlock &&
    lastBlock.type === 'text' &&
    delta.type === lastBlock.textType
  ) {
    // Merge with existing text block of same type
    const updatedBlock: ContentBlock = {
      ...lastBlock,
      content: lastBlock.content + delta.text,
    }
    return [...newBlocks.slice(0, -1), updatedBlock]
  }

  // Create new text block
  return [
    ...newBlocks,
    {
      type: 'text' as const,
      content: delta.text,
      textType: delta.type,
      ...(delta.type === 'reasoning' && {
        color: 'grey',
        isCollapsed: true,
      }),
    },
  ]
}

/**
 * Extracts plan content from a buffer if complete <PLAN>...</PLAN> tags exist.
 * Returns null if no complete plan is found.
 */
export const extractPlanFromBuffer = (buffer: string): string | null => {
  if (!buffer.includes('</PLAN>')) {
    return null
  }

  const openIdx = buffer.indexOf('<PLAN>')
  const closeIdx = buffer.indexOf('</PLAN>')

  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    return buffer.slice(openIdx + '<PLAN>'.length, closeIdx).trim()
  }

  return null
}

// ============================================================================
// Agent Block Helpers
// ============================================================================

/**
 * Creates a new agent content block.
 */
export const createAgentBlock = (params: {
  agentId: string
  agentType: string
  prompt?: string
  params?: Record<string, unknown>
}): AgentContentBlock => ({
  type: 'agent',
  agentId: params.agentId,
  agentName: params.agentType || 'Agent',
  agentType: params.agentType || 'unknown',
  content: '',
  status: 'running' as const,
  blocks: [] as ContentBlock[],
  initialPrompt: params.prompt || '',
  ...(params.params && { params: params.params }),
  ...(shouldCollapseByDefault(params.agentType || '') && {
    isCollapsed: true,
  }),
})

/**
 * Extracts the base name from an agent type string.
 * e.g., 'codebuff/file-picker@0.0.2' -> 'file-picker'
 *       'file-picker' -> 'file-picker'
 */
export const getAgentBaseName = (type: string): string => {
  if (type.includes('/')) {
    // Handle scoped names like 'codebuff/file-picker@0.0.2'
    return type.split('/')[1]?.split('@')[0] || type
  }
  // Handle simple names, possibly with version
  return type.split('@')[0]
}

/**
 * Checks if two agent types match by comparing their base names.
 */
export const agentTypesMatch = (type1: string, type2: string): boolean => {
  return getAgentBaseName(type1) === getAgentBaseName(type2)
}

// ============================================================================
// Tool Block Helpers
// ============================================================================

/**
 * Updates a tool block with output.
 * Returns the original array reference if no matching tool block is found.
 */
export const updateToolBlockWithOutput = (
  blocks: ContentBlock[],
  toolCallId: string,
  output: string,
): ContentBlock[] => {
  let foundMatch = false
  const result = blocks.map((block) => {
    if (block.type === 'tool' && block.toolCallId === toolCallId) {
      foundMatch = true
      return { ...block, output }
    }
    if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = updateToolBlockWithOutput(
        block.blocks,
        toolCallId,
        output,
      )
      // Avoid creating new block if nested blocks didn't change
      if (updatedBlocks !== block.blocks) {
        foundMatch = true
        return { ...block, blocks: updatedBlocks }
      }
    }
    return block
  })
  // Return original array reference if nothing changed
  return foundMatch ? result : blocks
}

// ============================================================================
// Ask User Transformation
// ============================================================================

/**
 * Transforms an ask_user tool block into an AskUserContentBlock when result is received.
 */
export const transformAskUserBlock = (
  blocks: ContentBlock[],
  toolCallId: string,
  resultValue: { answers?: unknown; skipped?: boolean },
): ContentBlock[] => {
  return blocks.map((block) => {
    if (
      block.type === 'tool' &&
      block.toolCallId === toolCallId &&
      block.toolName === 'ask_user'
    ) {
      const { skipped, answers } = resultValue
      const questions = block.input.questions

      if (!answers && !skipped) {
        // If no result data, keep as tool block (fallback)
        return block
      }

      return {
        type: 'ask-user',
        toolCallId,
        questions,
        answers,
        skipped,
      } as AskUserContentBlock
    }

    if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = transformAskUserBlock(
        block.blocks,
        toolCallId,
        resultValue,
      )
      if (updatedBlocks !== block.blocks) {
        return { ...block, blocks: updatedBlocks }
      }
    }
    return block
  })
}

// ============================================================================
// Interruption Handling
// ============================================================================

/**
 * Adds an interruption notice to message blocks.
 */
export const addInterruptionNotice = (blocks: ContentBlock[]): ContentBlock[] => {
  const newBlocks = [...blocks]
  const lastBlock = newBlocks[newBlocks.length - 1]

  if (lastBlock && lastBlock.type === 'text') {
    const interruptedBlock: ContentBlock = {
      type: 'text',
      content: `${lastBlock.content}\n\n[response interrupted]`,
    }
    return [...newBlocks.slice(0, -1), interruptedBlock]
  }

  const interruptionNotice: ContentBlock = {
    type: 'text',
    content: '[response interrupted]',
  }
  return [...newBlocks, interruptionNotice]
}

// ============================================================================
// Spawn Agents Helpers
// ============================================================================

/**
 * Creates agent blocks from a spawn_agents tool call input.
 */
export const createSpawnAgentBlocks = (
  toolCallId: string,
  agents: Array<{ agent_type?: string; prompt?: string }>,
): ContentBlock[] => {
  return agents
    .filter((agent) => !shouldHideAgent(agent.agent_type || ''))
    .map((agent, index) => ({
      type: 'agent' as const,
      agentId: `${toolCallId}-${index}`,
      agentName: agent.agent_type || 'Agent',
      agentType: agent.agent_type || 'unknown',
      content: '',
      status: 'running' as const,
      blocks: [] as ContentBlock[],
      initialPrompt: agent.prompt || '',
      ...(shouldCollapseByDefault(agent.agent_type || '') && {
        isCollapsed: true,
      }),
    }))
}

/**
 * Checks if a tool result is from spawn_agents based on its structure.
 */
export const isSpawnAgentsResult = (outputValue: unknown): boolean => {
  return (
    Array.isArray(outputValue) &&
    outputValue.some((v: unknown) => {
      if (typeof v !== 'object' || v === null) return false
      return has(v, 'agentName') || has(v, 'agentType')
    })
  )
}

/**
 * Extracts content from a spawn_agents result value.
 */
export const extractSpawnAgentResultContent = (
  result: { value?: unknown },
  formatToolOutput: (output: unknown[]) => string,
): { content: string; hasError: boolean } => {
  if (!has(result, 'value') || !result.value) {
    return { content: '', hasError: false }
  }

  const value = result.value as Record<string, unknown>
  let content: string

  if (typeof value === 'string') {
    content = value
  } else if (has(value, 'errorMessage') && value.errorMessage) {
    // Handle error messages from failed agent spawns
    content = String(value.errorMessage)
    return { content, hasError: true }
  } else if (
    has(value, 'value') &&
    value.value &&
    typeof value.value === 'string'
  ) {
    // Handle nested value structure like { type: "lastMessage", value: "..." }
    content = value.value
  } else if (has(value, 'message') && value.message) {
    content = String(value.message)
  } else {
    content = formatToolOutput([result])
  }

  return { content, hasError: false }
}

// ============================================================================
// Agent Text Content Updates
// ============================================================================

export type AgentTextUpdate =
  | { type: 'text'; content: string; replace?: boolean }
  | ToolContentBlock

/**
 * Updates an agent block's content with new text or a tool block.
 * Pure function that returns the updated block.
 */
export const updateAgentBlockContent = (
  block: AgentContentBlock,
  update: AgentTextUpdate,
): AgentContentBlock => {
  const agentBlocks: ContentBlock[] = block.blocks ? [...block.blocks] : []

  if (update.type === 'text') {
    const text = update.content ?? ''
    const replace = update.replace ?? false

    if (replace) {
      const updatedBlocks = [...agentBlocks]
      let replaced = false

      for (let i = updatedBlocks.length - 1; i >= 0; i--) {
        const entry = updatedBlocks[i]
        if (entry.type === 'text') {
          replaced = true
          if (entry.content === text && block.content === text) {
            // No change needed
            return block
          }
          updatedBlocks[i] = { ...entry, content: text }
          break
        }
      }

      if (!replaced) {
        updatedBlocks.push({ type: 'text', content: text })
      }

      return {
        ...block,
        content: text,
        blocks: updatedBlocks,
      }
    }

    if (!text) {
      return block
    }

    const lastBlock = agentBlocks[agentBlocks.length - 1]
    if (lastBlock && lastBlock.type === 'text') {
      if (lastBlock.content.endsWith(text)) {
        // Skip duplicate append
        return block
      }
      const updatedLastBlock: ContentBlock = {
        ...lastBlock,
        content: lastBlock.content + text,
      }
      const updatedContent = (block.content ?? '') + text
      return {
        ...block,
        content: updatedContent,
        blocks: [...agentBlocks.slice(0, -1), updatedLastBlock],
      }
    } else {
      const updatedContent = (block.content ?? '') + text
      return {
        ...block,
        content: updatedContent,
        blocks: [...agentBlocks, { type: 'text', content: text }],
      }
    }
  } else if (update.type === 'tool') {
    return { ...block, blocks: [...agentBlocks, update] }
  }

  return block
}

// ============================================================================
// Message Completion Helpers
// ============================================================================

/**
 * Marks a message as complete with optional metadata.
 */
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

/**
 * Updates a message with an error, clearing blocks so content renders.
 */
export const setMessageError = (
  message: ChatMessage,
  errorContent: string,
): ChatMessage => ({
  ...message,
  content: errorContent,
  blocks: undefined,
  isComplete: true,
})

// ============================================================================
// Hidden Tool Names
// ============================================================================

const hiddenToolNames = new Set<ToolName | 'spawn_agent_inline'>([
  'spawn_agent_inline',
  'end_turn',
  'spawn_agents',
])

/**
 * Checks if a tool name should be hidden from the UI.
 */
export const isHiddenToolName = (toolName: string): boolean => {
  return hiddenToolNames.has(toolName as ToolName | 'spawn_agent_inline')
}
