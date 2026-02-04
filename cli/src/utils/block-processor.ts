
import {
  isImplementorAgent,
  groupConsecutiveImplementors,
  groupConsecutiveNonImplementorAgents,
  groupConsecutiveToolBlocks,
} from './implementor-helpers'
import { isImageBlock } from '../types/chat'

import type {
  ContentBlock,
  AgentContentBlock,
  ToolContentBlock,
  TextContentBlock,
  ImageContentBlock,
} from '../types/chat'
import type { ReactNode } from 'react'

/**
 * Type guard for reasoning text blocks (thinking blocks)
 */
export function isReasoningTextBlock(
  block: ContentBlock,
): block is Extract<ContentBlock, { type: 'text' }> {
  return block.type === 'text' && block.textType === 'reasoning'
}

/**
 * Handler callbacks for processing different block types.
 * Each handler receives the block(s) and relevant indices, and returns a ReactNode.
 */
export interface BlockProcessorHandlers {
  /** Handle a group of consecutive reasoning text blocks */
  onReasoningGroup: (
    blocks: TextContentBlock[],
    startIndex: number,
  ) => ReactNode

  /** Handle an image block (optional - if not provided, images are skipped) */
  onImageBlock?: (block: ImageContentBlock, index: number) => ReactNode

  /** Handle a group of consecutive tool blocks */
  onToolGroup: (
    blocks: ToolContentBlock[],
    startIndex: number,
    nextIndex: number,
  ) => ReactNode

  /** Handle a group of consecutive implementor agent blocks */
  onImplementorGroup: (
    blocks: AgentContentBlock[],
    startIndex: number,
    nextIndex: number,
  ) => ReactNode

  /** Handle a group of consecutive non-implementor agent blocks */
  onAgentGroup: (
    blocks: AgentContentBlock[],
    startIndex: number,
    nextIndex: number,
  ) => ReactNode

  /** Handle a single block that doesn't fit into any group category */
  onSingleBlock: (block: ContentBlock, index: number) => ReactNode
}

/**
 * Process a list of content blocks, grouping consecutive blocks of the same type
 * and calling the appropriate handler for each group or single block.
 *
 * This utility abstracts the common iteration pattern used by BlocksRenderer and AgentBody.
 *
 * @param blocks - The array of content blocks to process
 * @param handlers - Callback handlers for each block type
 * @returns An array of ReactNode elements
 */
export function processBlocks(
  blocks: ContentBlock[],
  handlers: BlockProcessorHandlers,
): ReactNode[] {
  const nodes: ReactNode[] = []

  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i]

    // Handle reasoning text blocks (thinking)
    if (isReasoningTextBlock(block)) {
      const start = i
      const reasoningBlocks: TextContentBlock[] = []
      while (i < blocks.length) {
        const currentBlock = blocks[i]
        if (!isReasoningTextBlock(currentBlock)) break
        reasoningBlocks.push(currentBlock)
        i++
      }

      const node = handlers.onReasoningGroup(reasoningBlocks, start)
      if (node !== null) {
        nodes.push(node)
      }
      continue
    }

    // Handle image blocks
    if (isImageBlock(block)) {
      if (handlers.onImageBlock) {
        const node = handlers.onImageBlock(block, i)
        if (node !== null) {
          nodes.push(node)
        }
      }
      i++
      continue
    }

    // Handle tool blocks
    if (block.type === 'tool') {
      const start = i
      const { group: toolBlocks, nextIndex } = groupConsecutiveToolBlocks(
        blocks,
        i,
      )
      i = nextIndex

      const node = handlers.onToolGroup(toolBlocks, start, nextIndex)
      if (node !== null) {
        nodes.push(node)
      }
      continue
    }

    // Handle agent blocks
    if (block.type === 'agent') {
      if (isImplementorAgent(block)) {
        // Implementor agents
        const start = i
        const { group: implementors, nextIndex } = groupConsecutiveImplementors(
          blocks,
          i,
        )
        i = nextIndex

        const node = handlers.onImplementorGroup(implementors, start, nextIndex)
        if (node !== null) {
          nodes.push(node)
        }
      } else {
        // Non-implementor agents
        const start = i
        const { group: agentBlocks, nextIndex } =
          groupConsecutiveNonImplementorAgents(blocks, i)
        i = nextIndex

        const node = handlers.onAgentGroup(agentBlocks, start, nextIndex)
        if (node !== null) {
          nodes.push(node)
        }
      }
      continue
    }

    // Handle all other block types (text, html, etc.)
    const node = handlers.onSingleBlock(block, i)
    if (node !== null) {
      nodes.push(node)
    }
    i++
  }

  return nodes
}
