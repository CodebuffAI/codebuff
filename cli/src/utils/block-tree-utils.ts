import type { ContentBlock } from '../types/chat'
import { isCollapsibleBlock } from '../types/chat'

/** Checks if a block matches the given ID (agentId, toolCallId, thinkingId, or id). */
function blockMatchesId(block: ContentBlock, id: string): boolean {
  if (block.type === 'agent' && block.agentId === id) return true
  if (block.type === 'tool' && block.toolCallId === id) return true
  if (block.type === 'text' && block.thinkingId === id) return true
  if (block.type === 'agent-list' && block.id === id) return true
  return false
}

/** Recursively updates blocks matching predicate. Preserves reference equality if unchanged. */
function updateBlocksByPredicate(
  blocks: ContentBlock[],
  predicate: (block: ContentBlock) => boolean,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] {
  let hasChanges = false

  const result = blocks.map((block) => {
    if (predicate(block)) {
      hasChanges = true
      return updateFn(block)
    }

    if (block.type === 'agent' && block.blocks) {
      const updatedBlocks = updateBlocksByPredicate(
        block.blocks,
        predicate,
        updateFn,
      )
      if (updatedBlocks !== block.blocks) {
        hasChanges = true
        return { ...block, blocks: updatedBlocks }
      }
    }

    return block
  })

  return hasChanges ? result : blocks
}

/** Visits all blocks recursively. Return false from visitor to stop traversal early. Returns false if stopped early. */
export function traverseBlocks(
  blocks: ContentBlock[],
  visitor: (block: ContentBlock) => boolean | void,
): boolean {
  for (const block of blocks) {
    const shouldContinue = visitor(block)
    if (shouldContinue === false) return false

    if (block.type === 'agent' && block.blocks) {
      const nestedContinue = traverseBlocks(block.blocks, visitor)
      if (!nestedContinue) return false
    }
  }
  return true
}

/** Finds the first block matching the predicate, or undefined if not found. */
export function findBlockByPredicate(
  blocks: ContentBlock[],
  predicate: (block: ContentBlock) => boolean,
): ContentBlock | undefined {
  for (const block of blocks) {
    if (predicate(block)) return block

    if (block.type === 'agent' && block.blocks) {
      const found = findBlockByPredicate(block.blocks, predicate)
      if (found) return found
    }
  }
  return undefined
}

/** Maps all blocks recursively. Preserves reference equality if mapper returns same block. */
export function mapBlocks(
  blocks: ContentBlock[],
  mapper: (block: ContentBlock) => ContentBlock,
): ContentBlock[] {
  let hasChanges = false

  const result = blocks.map((block) => {
    // First recurse into nested blocks if present
    let processedBlock = block
    if (block.type === 'agent' && block.blocks) {
      const mappedChildren = mapBlocks(block.blocks, mapper)
      if (mappedChildren !== block.blocks) {
        hasChanges = true
        processedBlock = { ...block, blocks: mappedChildren }
      }
    }

    // Then apply the mapper to the block (with updated children)
    const mappedBlock = mapper(processedBlock)
    if (mappedBlock !== processedBlock) {
      hasChanges = true
      return mappedBlock
    }
    return processedBlock
  })

  return hasChanges ? result : blocks
}

/** Updates the block matching the given ID (checks agentId, toolCallId, thinkingId, id). */
export function updateBlockById(
  blocks: ContentBlock[],
  id: string,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] {
  return updateBlocksByPredicate(
    blocks,
    (block) => blockMatchesId(block, id),
    updateFn,
  )
}

/** Updates agent blocks matching the given agentId. */
export function updateAgentBlockById(
  blocks: ContentBlock[],
  agentId: string,
  updateFn: (block: ContentBlock) => ContentBlock,
): ContentBlock[] {
  return updateBlocksByPredicate(
    blocks,
    (block) => block.type === 'agent' && block.agentId === agentId,
    updateFn,
  )
}

/**
 * Toggles the collapsed state of a block. When expanding, sets userOpened=true.
 * Returns non-collapsible blocks unchanged.
 */
export function toggleBlockCollapse(block: ContentBlock): ContentBlock {
  // Use type guard to safely narrow to collapsible block types
  if (!isCollapsibleBlock(block)) {
    return block
  }

  const wasCollapsed = block.isCollapsed ?? false

  return {
    ...block,
    isCollapsed: !wasCollapsed,
    // Mark as user-opened only when transitioning from collapsed → expanded
    userOpened: wasCollapsed,
  }
}
