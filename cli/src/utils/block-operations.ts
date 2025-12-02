import { updateBlocksRecursively } from './message-block-helpers'

import type { ContentBlock, ToolContentBlock } from '../types/chat'

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

    const lastBlock = agentBlocks[agentBlocks.length - 1]
    if (lastBlock && lastBlock.type === 'text') {
      if (lastBlock.content.endsWith(text)) {
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
    }

    const updatedContent = (block.content ?? '') + text
    return {
      ...block,
      content: updatedContent,
      blocks: [...agentBlocks, { type: 'text', content: text }],
    }
  })
}

export const appendTextToRootStream = (
  blocks: ContentBlock[],
  delta: { type: 'text' | 'reasoning'; text: string },
) => {
  if (!delta.text) {
    return blocks
  }

  const nextBlocks = [...blocks]
  const lastBlock = nextBlocks[nextBlocks.length - 1]

  if (
    lastBlock &&
    lastBlock.type === 'text' &&
    lastBlock.textType === delta.type
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
    textType: delta.type,
    ...(delta.type === 'reasoning' && { color: 'grey', isCollapsed: true }),
  }

  return [...nextBlocks, newBlock]
}

export const appendTextToAgentBlock = (
  blocks: ContentBlock[],
  agentId: string,
  text: string,
) => updateAgentText(blocks, agentId, { type: 'text', mode: 'append', content: text })

export const replaceTextInAgentBlock = (
  blocks: ContentBlock[],
  agentId: string,
  text: string,
) => updateAgentText(blocks, agentId, { type: 'text', mode: 'replace', content: text })

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

export const markAgentComplete = (
  blocks: ContentBlock[],
  agentId: string,
) =>
  updateBlocksRecursively(blocks, agentId, (block) => {
    if (block.type !== 'agent') {
      return block
    }
    return { ...block, status: 'complete' as const }
  })
