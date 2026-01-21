import React, { memo, type ReactNode } from 'react'

import { ToolBranch } from './tool-branch'
import type { ContentBlock } from '../../types/chat'
import type { MarkdownPalette } from '../../utils/markdown-renderer'

interface ToolBlockGroupProps {
  toolBlocks: Extract<ContentBlock, { type: 'tool' }>[]
  keyPrefix: string
  startIndex: number
  nextIndex: number
  siblingBlocks: ContentBlock[]
  availableWidth: number
  onToggleCollapsed: (id: string) => void
  markdownPalette: MarkdownPalette
}

const isRenderableTimelineBlock = (
  block: ContentBlock | null | undefined,
): boolean => {
  if (!block) {
    return false
  }

  if (block.type === 'tool') {
    return block.toolName !== 'end_turn'
  }

  switch (block.type) {
    case 'text':
    case 'html':
    case 'agent':
    case 'agent-list':
    case 'plan':
    case 'mode-divider':
    case 'ask-user':
    case 'image':
      return true
    default:
      return false
  }
}

export const ToolBlockGroup = memo(
  ({
    toolBlocks,
    keyPrefix,
    startIndex,
    nextIndex,
    siblingBlocks,
    availableWidth,
    onToggleCollapsed,
    markdownPalette,
  }: ToolBlockGroupProps): ReactNode => {
    const groupNodes = toolBlocks
      .map((toolBlock) => (
        <ToolBranch
          key={`${keyPrefix}-tool-${toolBlock.toolCallId}`}
          toolBlock={toolBlock}
          keyPrefix={`${keyPrefix}-tool-${toolBlock.toolCallId}`}
          availableWidth={availableWidth}
          onToggleCollapsed={onToggleCollapsed}
          markdownPalette={markdownPalette}
        />
      ))
      .filter(Boolean)

    if (groupNodes.length === 0) return null

    const hasRenderableBefore =
      startIndex > 0 && isRenderableTimelineBlock(siblingBlocks[startIndex - 1])
    let hasRenderableAfter = false
    for (let i = nextIndex; i < siblingBlocks.length; i++) {
      if (isRenderableTimelineBlock(siblingBlocks[i])) {
        hasRenderableAfter = true
        break
      }
    }

    return (
      <box
        key={`${keyPrefix}-tool-group-${startIndex}`}
        style={{
          flexDirection: 'column',
          gap: 0,
          marginTop: hasRenderableBefore ? 1 : 0,
          marginBottom: hasRenderableAfter ? 1 : 0,
        }}
      >
        {groupNodes}
      </box>
    )
  },
)
