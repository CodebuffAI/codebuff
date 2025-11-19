import type { ContentBlock } from '../types/chat'

export function updateBlocksRecursively(
  blocks: ContentBlock[],
  predicate: (block: ContentBlock) => boolean,
  updater: (block: ContentBlock) => ContentBlock,
): ContentBlock[] {
  let foundTarget = false

  const result = blocks.map((block) => {
    let updatedBlock = block

    if (predicate(block)) {
      foundTarget = true
      updatedBlock = updater(block)
    }

    if (updatedBlock.type === 'agent' && updatedBlock.blocks) {
      const updatedChildren = updateBlocksRecursively(
        updatedBlock.blocks,
        predicate,
        updater,
      )

      if (updatedChildren !== updatedBlock.blocks) {
        foundTarget = true
        updatedBlock = {
          ...updatedBlock,
          blocks: updatedChildren,
        }
      }
    }

    return updatedBlock
  })

  return foundTarget ? result : blocks
}

export function toggleCollapsedById(
  blocks: ContentBlock[],
  id: string,
): ContentBlock[] {
  return updateBlocksRecursively(
    blocks,
    (block) => {
      if (block.type === 'agent' && block.agentId === id) return true
      if (block.type === 'tool' && block.toolCallId === id) return true
      if (block.type === 'agent-list' && block.id === id) return true
      if (block.type === 'text' && block.thinkingId === id) return true
      return false
    },
    (block) => {
      if (block.type === 'text') {
        const wasCollapsed = block.isCollapsed ?? false
        return {
          ...block,
          isCollapsed: !wasCollapsed,
          userOpened: wasCollapsed,
        }
      }

      if (block.type === 'agent') {
        const wasCollapsed = block.isCollapsed ?? false
        return {
          ...block,
          isCollapsed: !wasCollapsed,
          userOpened: wasCollapsed,
        }
      }

      if (block.type === 'tool') {
        const wasCollapsed = block.isCollapsed ?? false
        return {
          ...block,
          isCollapsed: !wasCollapsed,
          userOpened: wasCollapsed,
        }
      }

      if (block.type === 'agent-list') {
        const wasCollapsed = block.isCollapsed ?? false
        return {
          ...block,
          isCollapsed: !wasCollapsed,
          userOpened: wasCollapsed,
        }
      }

      return block
    },
  )
}

export function autoCollapseBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const collapseBlock = (block: ContentBlock): ContentBlock => {
    if (block.type === 'text' && block.thinkingId) {
      if (block.userOpened) return block
      return { ...block, isCollapsed: true }
    }

    if (block.type === 'agent') {
      const base = block.userOpened
        ? block
        : { ...block, isCollapsed: true }

      if (!base.blocks) return base

      return {
        ...base,
        blocks: base.blocks.map(collapseBlock),
      }
    }

    if (block.type === 'tool') {
      if (block.userOpened) return block
      return { ...block, isCollapsed: true }
    }

    if (block.type === 'agent-list') {
      if (block.userOpened) return block
      return { ...block, isCollapsed: true }
    }

    return block
  }

  return blocks.map(collapseBlock)
}
