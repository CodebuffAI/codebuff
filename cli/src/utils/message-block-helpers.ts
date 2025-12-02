import { has, isEqual } from 'lodash'

import { formatToolOutput } from './codebuff-client'
import { shouldCollapseByDefault } from './constants'

import type {
  ContentBlock,
  AgentContentBlock,
  AskUserContentBlock,
} from '../types/chat'

/**
 * Extracts the base agent name from a potentially scoped/versioned agent type string.
 *
 * @example
 * getAgentBaseName('codebuff/file-picker@0.0.2') // 'file-picker'
 * getAgentBaseName('file-picker@1.0.0') // 'file-picker'
 * getAgentBaseName('file-picker') // 'file-picker'
 */
export const getAgentBaseName = (type: string): string => {
  const segment = type.split('/').pop() ?? type
  return segment.split('@')[0]
}

/**
 * Extracts plan content from a buffer containing <PLAN>...</PLAN> tags.
 * Returns the trimmed content between tags, or null if not found.
 */
export const extractPlanFromBuffer = (buffer: string): string | null => {
  const openIdx = buffer.indexOf('<PLAN>')
  const closeIdx = buffer.indexOf('</PLAN>')
  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    return buffer.slice(openIdx + '<PLAN>'.length, closeIdx).trim()
  }
  return null
}

export const scrubPlanTags = (s: string): string => {
  // Support both the canonical </PLAN> tag and the legacy </cb_plan> tag.
  const closingTagPattern = '(?:<\\/PLAN>|<\\/cb_plan>)'
  return s
    .replace(new RegExp(`<PLAN>[\\s\\S]*?${closingTagPattern}`, 'g'), '')
    .replace(/<PLAN>[\s\S]*$/g, '')
}

export const scrubPlanTagsInBlocks = (
  blocks: ContentBlock[],
): ContentBlock[] => {
  return blocks
    .map((block) => {
      if (block.type !== 'text') {
        return block
      }
      const newContent = scrubPlanTags(block.content)
      return { ...block, content: newContent }
    })
    .filter((block) => block.type !== 'text' || block.content.trim() !== '')
}

export const insertPlanBlock = (
  blocks: ContentBlock[],
  planContent: string,
): ContentBlock[] => {
  const cleanedBlocks = scrubPlanTagsInBlocks(blocks)
  return [
    ...cleanedBlocks,
    {
      type: 'plan',
      content: planContent,
    },
  ]
}

/**
 * Recursively collapses blocks that weren't manually opened by the user.
 * Preserves user intent by keeping blocks open if userOpened is true.
 */
export const autoCollapseBlocks = (blocks: ContentBlock[]): ContentBlock[] => {
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
          blocks: autoCollapseBlocks(updatedBlock.blocks),
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
 * Result of extracting content from a spawn_agents result value.
 */
export interface SpawnAgentResultContent {
  content: string
  hasError: boolean
}

/**
 * Extracts displayable content from a spawn_agents result value.
 * Handles various nested structures that can come back from agent spawns.
 */
export const extractSpawnAgentResultContent = (
  resultValue: unknown,
): SpawnAgentResultContent => {
  if (typeof resultValue === 'string') {
    return { content: resultValue, hasError: false }
  }

  if (resultValue && typeof resultValue === 'object') {
    const nestedValue = (resultValue as any).value

    if (typeof nestedValue === 'string') {
      return { content: nestedValue, hasError: false }
    }

    if (nestedValue && typeof nestedValue === 'object') {
      if (has(nestedValue, 'errorMessage') && (nestedValue as any).errorMessage) {
        return {
          content: String((nestedValue as any).errorMessage),
          hasError: true,
        }
      }

      if (has(nestedValue, 'message') && (nestedValue as any).message) {
        return { content: String((nestedValue as any).message), hasError: false }
      }
    }

    if (
      typeof resultValue === 'object' &&
      Object.keys(resultValue as Record<string, unknown>).length === 0
    ) {
      return { content: '', hasError: false }
    }

    // Handle error messages from failed agent spawns
    if (has(resultValue, 'errorMessage') && (resultValue as any).errorMessage) {
      return {
        content: String((resultValue as any).errorMessage),
        hasError: true,
      }
    }

    // Handle nested value structure like { type: "lastMessage", value: "..." }
    if (
      has(resultValue, 'value') &&
      (resultValue as any).value &&
      typeof (resultValue as any).value === 'string'
    ) {
      return { content: (resultValue as any).value, hasError: false }
    }

    // Handle message field
    if (has(resultValue, 'message') && (resultValue as any).message) {
      return { content: (resultValue as any).message, hasError: false }
    }
  }

  if (!resultValue) {
    return { content: '', hasError: false }
  }

  // Fallback to formatted output
  return {
    content: formatToolOutput([{ type: 'json', value: resultValue }]),
    hasError: false,
  }
}

/**
 * Appends an interruption notice to blocks, either by modifying the last
 * text block or adding a new one.
 */
export const appendInterruptionNotice = (
  blocks: ContentBlock[],
): ContentBlock[] => {
  const lastBlock = blocks[blocks.length - 1]

  if (lastBlock && lastBlock.type === 'text') {
    const interruptedBlock: ContentBlock = {
      ...lastBlock,
      content: `${lastBlock.content}\n\n[response interrupted]`,
    }
    return [...blocks.slice(0, -1), interruptedBlock]
  }

  const interruptionNotice: ContentBlock = {
    type: 'text',
    content: '[response interrupted]',
  }
  return [...blocks, interruptionNotice]
}

/**
 * Options for creating an agent content block.
 */
export interface CreateAgentBlockOptions {
  agentId: string
  agentType: string
  prompt?: string
  params?: Record<string, unknown>
}

/**
 * Creates a new agent content block with standard defaults.
 */
export const createAgentBlock = (
  options: CreateAgentBlockOptions,
): AgentContentBlock => {
  const { agentId, agentType, prompt, params } = options
  return {
    type: 'agent',
    agentId,
    agentName: agentType || 'Agent',
    agentType: agentType || 'unknown',
    content: '',
    status: 'running' as const,
    blocks: [] as ContentBlock[],
    initialPrompt: prompt || '',
    ...(params && { params }),
    ...(shouldCollapseByDefault(agentType || '') && { isCollapsed: true }),
  }
}

/**
 * Helper function to recursively update blocks by target agent ID.
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

  return foundTarget ? result : blocks
}

/**
 * Result from nestBlockUnderParent indicating whether the parent was found.
 */
export interface NestBlockResult {
  blocks: ContentBlock[]
  parentFound: boolean
}

/**
 * Nests a block under a parent agent, or returns it at top level if parent not found.
 */
export const nestBlockUnderParent = (
  blocks: ContentBlock[],
  parentAgentId: string,
  blockToNest: ContentBlock,
): NestBlockResult => {
  let parentFound = false
  const updatedBlocks = updateBlocksRecursively(
    blocks,
    parentAgentId,
    (parentBlock) => {
      if (parentBlock.type !== 'agent') {
        return parentBlock
      }
      parentFound = true
      return {
        ...parentBlock,
        blocks: [...(parentBlock.blocks || []), blockToNest],
      }
    },
  )

  return { blocks: updatedBlocks, parentFound }
}

/**
 * Extracts a block with given agentId from nested blocks structure.
 * Returns the remaining blocks and the extracted block (if found).
 */
export const extractBlockById = (
  blocks: ContentBlock[],
  targetAgentId: string,
): { remainingBlocks: ContentBlock[]; extractedBlock: ContentBlock | null } => {
  let extractedBlock: ContentBlock | null = null

  const extractRecursively = (blocks: ContentBlock[]): ContentBlock[] => {
    const result: ContentBlock[] = []
    for (const block of blocks) {
      if (block.type === 'agent' && block.agentId === targetAgentId) {
        extractedBlock = block
        // Don't add to result - we're extracting it
      } else if (block.type === 'agent' && block.blocks) {
        result.push({
          ...block,
          blocks: extractRecursively(block.blocks),
        })
      } else {
        result.push(block)
      }
    }
    return result
  }

  const remainingBlocks = extractRecursively(blocks)
  return { remainingBlocks, extractedBlock }
}

export const moveSpawnAgentBlock = (
  blocks: ContentBlock[],
  tempId: string,
  realId: string,
  parentId?: string,
  params?: Record<string, unknown>,
  prompt?: string,
): ContentBlock[] => {
  const { remainingBlocks, extractedBlock } = extractBlockById(blocks, tempId)

  const updateAgentBlock = (block: ContentBlock): ContentBlock => {
    if (block.type !== 'agent') {
      return block
    }
    const updatedBlock: ContentBlock = {
      ...block,
      agentId: realId,
    }

    if (params) {
      updatedBlock.params = params
    }

    if (prompt && block.initialPrompt === '') {
      updatedBlock.initialPrompt = prompt
    }

    return updatedBlock
  }

  if (!extractedBlock) {
    return updateBlocksRecursively(blocks, tempId, updateAgentBlock)
  }

  if (extractedBlock.type !== 'agent') {
    return remainingBlocks
  }

  const blockToMove = updateAgentBlock(extractedBlock)

  if (parentId) {
    const { blocks: nestedBlocks, parentFound } = nestBlockUnderParent(
      remainingBlocks,
      parentId,
      blockToMove,
    )
    if (parentFound) {
      return nestedBlocks
    }
  }

  return [...remainingBlocks, blockToMove]
}

/**
 * Options for transforming ask_user tool blocks to ask-user content blocks.
 */
export interface TransformAskUserOptions {
  toolCallId: string
  resultValue: unknown
}

/**
 * Transforms ask_user tool blocks into ask-user content blocks when tool results arrive.
 * Recursively processes nested agent blocks.
 */
export const transformAskUserBlocks = (
  blocks: ContentBlock[],
  options: TransformAskUserOptions,
): ContentBlock[] => {
  const { toolCallId, resultValue } = options

  return blocks.map((block) => {
    if (
      block.type === 'tool' &&
      block.toolCallId === toolCallId &&
      block.toolName === 'ask_user'
    ) {
      const skipped = (resultValue as any)?.skipped
      const answers = (resultValue as any)?.answers
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
      const updatedBlocks = transformAskUserBlocks(block.blocks, options)
      if (updatedBlocks !== block.blocks) {
        return { ...block, blocks: updatedBlocks }
      }
    }
    return block
  })
}

/**
 * Options for updating tool blocks with output.
 */
export interface UpdateToolBlockOptions {
  toolCallId: string
  toolOutput: unknown[]
}

/**
 * Updates tool blocks with their output when tool results arrive.
 * Handles special formatting for terminal command output.
 * Recursively processes nested agent blocks.
 */
export const updateToolBlockWithOutput = (
  blocks: ContentBlock[],
  options: UpdateToolBlockOptions,
): ContentBlock[] => {
  const { toolCallId, toolOutput } = options

  return blocks.map((block) => {
    if (block.type === 'tool' && block.toolCallId === toolCallId) {
      let output: string
      if (block.toolName === 'run_terminal_command') {
        const parsed = (toolOutput?.[0] as any)?.value
        if (parsed?.stdout || parsed?.stderr) {
          output = (parsed.stdout || '') + (parsed.stderr || '')
        } else {
          output = formatToolOutput(toolOutput)
        }
      } else {
        output = formatToolOutput(toolOutput)
      }
      return { ...block, output }
    } else if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = updateToolBlockWithOutput(block.blocks, options)
      // Avoid creating new block if nested blocks didn't change
      if (isEqual(block.blocks, updatedBlocks)) {
        return block
      }
      return { ...block, blocks: updatedBlocks }
    }
    return block
  })
}
