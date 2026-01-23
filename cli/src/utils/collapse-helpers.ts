/**
 * Pure utility functions for collapse/expand all functionality.
 */

import type { ChatMessage, ContentBlock } from '../types/chat'

/**
 * Type representing a block that supports collapsing.
 * This includes: thinking blocks (text with thinkingId), agent blocks, tool blocks, and agent-list blocks.
 */
type CollapsibleBlock = ContentBlock & {
  isCollapsed?: boolean
  userOpened?: boolean
}

/**
 * Checks if a content block is collapsible.
 * Collapsible blocks are: thinking blocks (text with thinkingId), agent, tool, and agent-list blocks.
 */
function isCollapsibleBlock(block: ContentBlock): block is CollapsibleBlock {
  if (block.type === 'text' && 'thinkingId' in block && block.thinkingId) {
    return true
  }
  if (block.type === 'agent' || block.type === 'tool' || block.type === 'agent-list') {
    return true
  }
  return false
}

/**
 * Checks if a collapsible block is explicitly expanded.
 * A block is considered expanded only if isCollapsed is explicitly set to false.
 * Undefined isCollapsed is treated as collapsed (the default state).
 */
function isBlockExpanded(block: CollapsibleBlock): boolean {
  return block.isCollapsed === false
}

/**
 * Gets the current collapsed state of a block.
 * Treats undefined as collapsed (true) to match the "undefined means collapsed" semantics.
 */
function getBlockCollapsedState(block: CollapsibleBlock): boolean {
  return block.isCollapsed ?? true
}

/**
 * Creates an updated block with new collapsed state if different from current.
 * Returns null if no change is needed.
 */
function createUpdatedBlock(
  block: CollapsibleBlock,
  collapsed: boolean,
): CollapsibleBlock | null {
  const currentCollapsed = getBlockCollapsedState(block)
  if (currentCollapsed === collapsed) {
    return null
  }
  return {
    ...block,
    isCollapsed: collapsed,
    userOpened: !collapsed ? true : block.userOpened,
  }
}

/**
 * Checks if any collapsible block in the given blocks array is expanded.
 * Recursively checks nested blocks within agent blocks.
 */
function hasAnyExpandedBlocksRecursive(blocks: ContentBlock[]): boolean {
  for (const block of blocks) {
    if (isCollapsibleBlock(block)) {
      if (isBlockExpanded(block)) {
        return true
      }
      // Recursively check nested blocks in agent blocks
      if (block.type === 'agent' && block.blocks) {
        if (hasAnyExpandedBlocksRecursive(block.blocks)) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Checks if any collapsible block in the messages array is expanded.
 * Returns true if at least one block is not collapsed.
 *
 * @param messages - The messages array to check
 * @returns true if any block is expanded, false if all are collapsed
 */
export function hasAnyExpandedBlocks(messages: ChatMessage[]): boolean {
  for (const message of messages) {
    // Handle agent variant messages
    if (message.variant === 'agent') {
      if (message.metadata?.isCollapsed === false) {
        return true
      }
    }

    // Handle blocks within messages
    if (message.blocks && hasAnyExpandedBlocksRecursive(message.blocks)) {
      return true
    }
  }

  return false
}

/**
 * Result type for recursive block update operation.
 */
interface UpdateBlocksResult {
  blocks: ContentBlock[]
  changed: boolean
}

/**
 * Recursively updates isCollapsed on all collapsible blocks.
 * Returns both the updated blocks and whether any changes were made.
 */
function updateBlocksRecursively(
  blocks: ContentBlock[],
  collapsed: boolean,
): UpdateBlocksResult {
  let anyChanged = false
  const result = blocks.map((block) => {
    if (!isCollapsibleBlock(block)) {
      return block
    }

    // Handle agent blocks specially due to nested blocks
    if (block.type === 'agent') {
      const currentCollapsed = getBlockCollapsedState(block)
      let updatedBlock = block
      let blockChanged = false

      // Check if this block's state needs updating
      if (currentCollapsed !== collapsed) {
        blockChanged = true
        updatedBlock = {
          ...block,
          isCollapsed: collapsed,
          userOpened: !collapsed ? true : block.userOpened,
        }
      }

      // Recursively update nested blocks
      if (block.blocks) {
        const nested = updateBlocksRecursively(block.blocks, collapsed)
        if (nested.changed) {
          blockChanged = true
          updatedBlock = {
            ...updatedBlock,
            blocks: nested.blocks,
          }
        }
      }

      if (blockChanged) {
        anyChanged = true
        return updatedBlock
      }
      return block
    }

    // Handle all other collapsible blocks (tool, text with thinkingId, agent-list)
    const updated = createUpdatedBlock(block, collapsed)
    if (updated) {
      anyChanged = true
      return updated
    }
    return block
  })

  return { blocks: anyChanged ? result : blocks, changed: anyChanged }
}

/**
 * Updates all collapsible blocks in all messages to the specified collapsed state.
 * This is a pure function that returns new message objects when changes are made.
 *
 * @param messages - The messages array to update
 * @param collapsed - Whether blocks should be collapsed (true) or expanded (false)
 * @returns Updated messages array with all collapsible blocks set to the specified state
 */
export function setAllBlocksCollapsedState(
  messages: ChatMessage[],
  collapsed: boolean,
): ChatMessage[] {
  return messages.map((message) => {
    let updatedMessage = message
    let messageChanged = false

    // Handle agent variant messages (message-level isCollapsed)
    if (message.variant === 'agent') {
      // Treat undefined as collapsed (true) to match hasAnyExpandedBlocks semantics
      const currentCollapsed = message.metadata?.isCollapsed ?? true
      if (currentCollapsed !== collapsed) {
        messageChanged = true
        updatedMessage = {
          ...updatedMessage,
          metadata: {
            ...updatedMessage.metadata,
            isCollapsed: collapsed,
            userOpened: !collapsed ? true : updatedMessage.metadata?.userOpened,
          },
        }
      }
    }

    // Handle blocks within messages (applies to all message variants)
    if (message.blocks) {
      const { blocks: updatedBlocks, changed } = updateBlocksRecursively(
        message.blocks,
        collapsed,
      )
      if (changed) {
        messageChanged = true
        updatedMessage = {
          ...updatedMessage,
          blocks: updatedBlocks,
        }
      }
    }

    return messageChanged ? updatedMessage : message
  })
}
