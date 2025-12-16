import { updateBlocksRecursively } from './message-block-helpers'
import {
  parseThinkTags,
  getPartialTagLength,
  THINK_OPEN_TAG,
  THINK_CLOSE_TAG,
} from './think-tag-parser'

import type {
  ContentBlock,
  ToolContentBlock,
  TextContentBlock,
} from '../types/chat'
import { logger } from './logger'

type AgentTextUpdate =
  | { type: 'text'; mode: 'append'; content: string }
  | { type: 'text'; mode: 'replace'; content: string }

const updateAgentText = (
  blocks: ContentBlock[],
  agentId: string,
  update: AgentTextUpdate,
) => {
  return updateBlocksRecursively(blocks, agentId, (block) => {
    if (block.type !== 'agent') {
      return block
    }

    const agentBlocks = block.blocks ? [...block.blocks] : []
    const text = update.content ?? ''

    if (update.mode === 'replace') {
      const updatedBlocks = [...agentBlocks]
      let replaced = false

      for (let i = updatedBlocks.length - 1; i >= 0; i--) {
        const entry = updatedBlocks[i]
        if (entry.type === 'text') {
          replaced = true
          if (entry.content === text && block.content === text) {
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

    // Use think tag parsing for agent blocks too
    const updatedAgentBlocks = appendTextWithThinkParsingToBlocks(
      agentBlocks,
      text,
    )
    const updatedContent = (block.content ?? '') + text
    return {
      ...block,
      content: updatedContent,
      blocks: updatedAgentBlocks,
    }
  })
}

/**
 * Check if a text block represents an open (unclosed) thinking block.
 */
const isOpenThinkingBlock = (block: ContentBlock | undefined): boolean => {
  if (!block || block.type !== 'text') {
    return false
  }
  return block.textType === 'reasoning' && block.thinkingOpen === true
}

/**
 * Creates a new reasoning (thinking) text block.
 */
const createReasoningBlock = (
  content: string,
  thinkingOpen: boolean,
): TextContentBlock => ({
  type: 'text',
  content,
  textType: 'reasoning',
  isCollapsed: true,
  thinkingOpen,
})

/**
 * Creates a new regular text block.
 */
const createTextBlock = (content: string): TextContentBlock => ({
  type: 'text',
  content,
  textType: 'text',
})

/**
 * Shared logic for appending text with think tag parsing.
 * Used by both root stream and agent blocks.
 */
const appendTextWithThinkParsingToBlocks = (
  blocks: ContentBlock[],
  text: string,
): ContentBlock[] => {
  if (!text) {
    return blocks
  }

  const nextBlocks = [...blocks]
  const lastBlock = nextBlocks[nextBlocks.length - 1]
  const wasInsideThinking = isOpenThinkingBlock(lastBlock)

  let textToParse = text
  let lastBlockContent = ''

  if (wasInsideThinking && lastBlock?.type === 'text') {
    lastBlockContent = lastBlock.content

    const partialLen = getPartialTagLength(lastBlockContent)
    if (partialLen > 0) {
      const potentialTag = lastBlockContent.slice(-partialLen) + text
      if (potentialTag.startsWith(THINK_CLOSE_TAG)) {
        const newLastContent = lastBlockContent.slice(0, -partialLen)
        textToParse = lastBlockContent.slice(-partialLen) + text

        if (newLastContent) {
          nextBlocks[nextBlocks.length - 1] = {
            ...lastBlock,
            content: newLastContent,
          }
        } else {
          nextBlocks.pop()
        }
      }
    }
  } else if (
    !wasInsideThinking &&
    lastBlock?.type === 'text' &&
    lastBlock.textType === 'text'
  ) {
    lastBlockContent = lastBlock.content
    const partialLen = getPartialTagLength(lastBlockContent)
    if (partialLen > 0) {
      const potentialTag = lastBlockContent.slice(-partialLen) + text
      if (potentialTag.startsWith(THINK_OPEN_TAG)) {
        const newLastContent = lastBlockContent.slice(0, -partialLen)
        textToParse = lastBlockContent.slice(-partialLen) + text

        if (newLastContent) {
          nextBlocks[nextBlocks.length - 1] = {
            ...lastBlock,
            content: newLastContent,
          }
        } else {
          nextBlocks.pop()
        }
      }
    }
  }

  const currentLastBlock = nextBlocks[nextBlocks.length - 1]
  const insideThinking = isOpenThinkingBlock(currentLastBlock)

  if (insideThinking && !textToParse.includes('<')) {
    if (currentLastBlock?.type === 'text') {
      nextBlocks[nextBlocks.length - 1] = {
        ...currentLastBlock,
        content: currentLastBlock.content + textToParse,
      }
      return nextBlocks
    }
  }

  if (!insideThinking && !textToParse.includes('<')) {
    if (
      currentLastBlock?.type === 'text' &&
      currentLastBlock.textType === 'text'
    ) {
      nextBlocks[nextBlocks.length - 1] = {
        ...currentLastBlock,
        content: currentLastBlock.content + textToParse,
      }
      return nextBlocks
    }
    return [...nextBlocks, createTextBlock(textToParse)]
  }

  const fullText = insideThinking ? THINK_OPEN_TAG + textToParse : textToParse

  const segments = parseThinkTags(fullText)

  let segmentStartIdx = 0
  if (
    insideThinking &&
    segments.length > 0 &&
    segments[0].type === 'thinking'
  ) {
    const firstSegment = segments[0]
    if (currentLastBlock?.type === 'text') {
      const hasMoreSegments = segments.length > 1
      const thinkingOpen =
        !hasMoreSegments && !textToParse.includes(THINK_CLOSE_TAG)

      nextBlocks[nextBlocks.length - 1] = {
        ...currentLastBlock,
        content: currentLastBlock.content + firstSegment.content,
        thinkingOpen,
      }
    }
    segmentStartIdx = 1
  } else if (insideThinking && textToParse.includes(THINK_CLOSE_TAG)) {
    // Handle case where we're inside thinking and receive </think> with no content
    // (e.g., just "</think>" or "</think>text"). In this case parseThinkTags returns
    // empty or starts with text, but we still need to close the thinking block.
    if (currentLastBlock?.type === 'text') {
      nextBlocks[nextBlocks.length - 1] = {
        ...currentLastBlock,
        thinkingOpen: false,
      }
    }
  }

  for (let i = segmentStartIdx; i < segments.length; i++) {
    const segment = segments[i]
    const isLastSegment = i === segments.length - 1

    if (segment.type === 'thinking') {
      const thinkingOpen =
        isLastSegment && !textToParse.endsWith(THINK_CLOSE_TAG)
      if (thinkingOpen) {
        nextBlocks.push(createReasoningBlock(segment.content, thinkingOpen))
      }
    } else {
      const prevBlock = nextBlocks[nextBlocks.length - 1]
      if (
        prevBlock?.type === 'text' &&
        prevBlock.textType === 'text' &&
        !prevBlock.thinkingOpen
      ) {
        nextBlocks[nextBlocks.length - 1] = {
          ...prevBlock,
          content: prevBlock.content + segment.content,
        }
      } else {
        nextBlocks.push(createTextBlock(segment.content))
      }
    }
  }

  return nextBlocks
}

export const appendTextToRootStream = (
  blocks: ContentBlock[],
  delta: { type: 'text' | 'reasoning'; text: string },
) => {
  if (!delta.text) {
    return blocks
  }

  // For reasoning type (from native reasoning_chunk events), use original behavior
  if (delta.type === 'reasoning') {
    const nextBlocks = [...blocks]
    const lastBlock = nextBlocks[nextBlocks.length - 1]

    if (
      lastBlock &&
      lastBlock.type === 'text' &&
      lastBlock.textType === 'reasoning'
    ) {
      const updatedBlock: ContentBlock = {
        ...lastBlock,
        content: lastBlock.content + delta.text,
      }
      nextBlocks[nextBlocks.length - 1] = updatedBlock
      return nextBlocks
    }

    const newBlock: ContentBlock = {
      type: 'text',
      content: delta.text,
      textType: 'reasoning',
      isCollapsed: true,
    }

    return [...nextBlocks, newBlock]
  }

  // For text type, parse for <think> tags
  return appendTextWithThinkParsingToBlocks(blocks, delta.text)
}

export const appendTextToAgentBlock = (
  blocks: ContentBlock[],
  agentId: string,
  text: string,
) =>
  updateAgentText(blocks, agentId, {
    type: 'text',
    mode: 'append',
    content: text,
  })

export const replaceTextInAgentBlock = (
  blocks: ContentBlock[],
  agentId: string,
  text: string,
) =>
  updateAgentText(blocks, agentId, {
    type: 'text',
    mode: 'replace',
    content: text,
  })

export const appendToolToAgentBlock = (
  blocks: ContentBlock[],
  agentId: string,
  toolBlock: ToolContentBlock,
) =>
  updateBlocksRecursively(blocks, agentId, (block) => {
    if (block.type !== 'agent') {
      return block
    }
    const agentBlocks = block.blocks ? [...block.blocks] : []
    return { ...block, blocks: [...agentBlocks, toolBlock] }
  })

export const markAgentComplete = (blocks: ContentBlock[], agentId: string) =>
  updateBlocksRecursively(blocks, agentId, (block) => {
    if (block.type !== 'agent') {
      return block
    }
    return { ...block, status: 'complete' as const }
  })
