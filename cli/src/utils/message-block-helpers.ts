import {
  updateAgentBlockById,
  findBlockByPredicate,
  mapBlocks,
} from './block-tree-utils'
import { formatToolOutput } from './codebuff-client'
import { shouldCollapseByDefault, shouldCollapseForParent } from './constants'

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
  return mapBlocks(blocks, (block) => {
    // Handle collapsible block types
    if (
      (block.type === 'text' && block.thinkingId) ||
      block.type === 'agent' ||
      block.type === 'tool' ||
      block.type === 'agent-list'
    ) {
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
 * Extracts text content from a Message object's content array.
 * Handles assistant messages with TextPart content.
 */
const extractTextFromMessageContent = (content: unknown): string => {
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('')
}

/**
 * Extracts displayable content from a spawn_agents result value.
 * Handles various nested structures that can come back from agent spawns.
 */
export const extractSpawnAgentResultContent = (
  resultValue: unknown,
): SpawnAgentResultContent => {
  // Handle null/undefined
  if (!resultValue) {
    return { content: '', hasError: false }
  }

  // Handle direct string
  if (typeof resultValue === 'string') {
    return { content: resultValue, hasError: false }
  }

  if (typeof resultValue !== 'object') {
    return { content: '', hasError: false }
  }

  const obj = resultValue as Record<string, unknown>

  // Handle empty object
  if (Object.keys(obj).length === 0) {
    return { content: '', hasError: false }
  }

  // Handle error messages (check both top-level and nested)
  if (obj.errorMessage) {
    return { content: String(obj.errorMessage), hasError: true }
  }
  if ((obj.value as any)?.errorMessage) {
    return { content: String((obj.value as any).errorMessage), hasError: true }
  }

  // Handle lastMessage and allMessages output modes: { type: "lastMessage"|"allMessages", value: [Message array] }
  // This is common for agents like researcher-web
  if ((obj.type === 'lastMessage' || obj.type === 'allMessages') && Array.isArray(obj.value)) {
    const messages = obj.value as Array<{ role?: string; content?: unknown }>
    const textContent = messages
      .filter((msg) => msg?.role === 'assistant')
      .map((msg) => extractTextFromMessageContent(msg?.content))
      .filter(Boolean)
      .join('\n')
    return { content: textContent, hasError: false }
  }

  // Handle structuredOutput mode: { type: "structuredOutput", value: any }
  if (obj.type === 'structuredOutput') {
    const value = obj.value
    // Check for message field in structured output
    if (value && typeof value === 'object') {
      const valueObj = value as Record<string, unknown>
      if (typeof valueObj.message === 'string') {
        return { content: valueObj.message, hasError: false }
      }
      // Check for data.message pattern
      if (valueObj.data && typeof valueObj.data === 'object') {
        const dataObj = valueObj.data as Record<string, unknown>
        if (typeof dataObj.message === 'string') {
          return { content: dataObj.message, hasError: false }
        }
      }
    }
    // Fall through to format as JSON
    return {
      content: formatToolOutput([{ type: 'json', value: obj.value }]),
      hasError: false,
    }
  }

  // Handle nested string value: { value: "..." }
  if (typeof obj.value === 'string') {
    return { content: obj.value, hasError: false }
  }

  // Handle message field (top-level or nested)
  if (obj.message) {
    return { content: String(obj.message), hasError: false }
  }
  if ((obj.value as any)?.message) {
    return { content: String((obj.value as any).message), hasError: false }
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
 * Recursively finds an agent block by ID and returns its agent type.
 * Returns undefined if not found.
 */
export const findAgentTypeById = (
  blocks: ContentBlock[],
  agentId: string,
): string | undefined => {
  const found = findBlockByPredicate(
    blocks,
    (block) => block.type === 'agent' && block.agentId === agentId,
  )
  return found?.type === 'agent' ? found.agentType : undefined
}

/**
 * Options for creating an agent content block.
 */
export interface CreateAgentBlockOptions {
  agentId: string
  agentType: string
  prompt?: string
  params?: Record<string, unknown>
  /** The spawn_agents tool call ID that created this block */
  spawnToolCallId?: string
  /** The index within the spawn_agents call */
  spawnIndex?: number
  /** The agent type of the parent agent that spawned this one */
  parentAgentType?: string
}

/**
 * Creates a new agent content block with standard defaults.
 */
export const createAgentBlock = (
  options: CreateAgentBlockOptions,
): AgentContentBlock => {
  const { agentId, agentType, prompt, params, spawnToolCallId, spawnIndex, parentAgentType } = options
  const shouldCollapse =
    shouldCollapseByDefault(agentType || '') ||
    shouldCollapseForParent(agentType || '', parentAgentType)
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
    ...(spawnToolCallId && { spawnToolCallId }),
    ...(spawnIndex !== undefined && { spawnIndex }),
    ...(shouldCollapse && { isCollapsed: true }),
  }
}

/** Recursively updates blocks by target agent ID. Delegates to updateAgentBlockById. */
export const updateBlocksRecursively = (
  blocks: ContentBlock[],
  targetAgentId: string,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] => {
  return updateAgentBlockById(blocks, targetAgentId, updateFn)
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
 * Checks if a block with the given agentId is already nested under the specified parent.
 */
const checkBlockIsUnderParent = (
  blocks: ContentBlock[],
  targetAgentId: string,
  parentAgentId: string,
): boolean => {
  const parent = findBlockByPredicate(
    blocks,
    (block) => block.type === 'agent' && block.agentId === parentAgentId,
  )
  if (!parent || parent.type !== 'agent' || !parent.blocks) {
    return false
  }
  // Check if target is anywhere in the parent's children
  const target = findBlockByPredicate(
    parent.blocks,
    (block) => block.type === 'agent' && block.agentId === targetAgentId,
  )
  return target !== undefined
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

  // If there's a parentId, we need to move the block under the parent.
  // First check if the block is already under the correct parent.
  if (parentId) {
    const isAlreadyUnderParent = checkBlockIsUnderParent(blocks, tempId, parentId)
    if (isAlreadyUnderParent) {
      // Block is already under the correct parent, just update it in place
      return updateBlocksRecursively(blocks, tempId, updateAgentBlock)
    }

    // Block needs to be moved under the parent - extract and nest
    const { remainingBlocks, extractedBlock } = extractBlockById(blocks, tempId)
    if (extractedBlock && extractedBlock.type === 'agent') {
      const blockToMove = updateAgentBlock(extractedBlock)
      const { blocks: nestedBlocks, parentFound } = nestBlockUnderParent(
        remainingBlocks,
        parentId,
        blockToMove,
      )
      if (parentFound) {
        return nestedBlocks
      }
      // Parent not found, update in place instead of appending to end
      return updateBlocksRecursively(blocks, tempId, updateAgentBlock)
    }
  }

  // No parentId or block not found - just update in place to preserve order
  return updateBlocksRecursively(blocks, tempId, updateAgentBlock)
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

  return mapBlocks(blocks, (block) => {
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

  return mapBlocks(blocks, (block) => {
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
    }
    return block
  })
}
