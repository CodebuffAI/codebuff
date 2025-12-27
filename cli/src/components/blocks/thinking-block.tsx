import { memo, useCallback } from 'react'

import { Thinking } from '../thinking'

import type { ContentBlock } from '../../types/chat'

// Nested thinking blocks need more offset to account for the subagent's border and padding
const WIDTH_OFFSET = 6
const NESTED_WIDTH_OFFSET = 10

interface ThinkingBlockProps {
  blocks: Extract<ContentBlock, { type: 'text' }>[]
  onToggleCollapsed: (id: string) => void
  availableWidth: number
  isNested: boolean
}

export const ThinkingBlock = memo(
  ({
    blocks,
    onToggleCollapsed,
    availableWidth,
    isNested,
  }: ThinkingBlockProps) => {
    const firstBlock = blocks[0]
    const thinkingId = firstBlock?.thinkingId
    const combinedContent = blocks
      .map((b) => b.content)
      .join('')
      .trim()

    const isCollapsed = firstBlock?.isCollapsed ?? true
    const offset = isNested ? NESTED_WIDTH_OFFSET : WIDTH_OFFSET
    const availWidth = Math.max(10, availableWidth - offset)

    const handleToggle = useCallback(() => {
      if (thinkingId) {
        onToggleCollapsed(thinkingId)
      }
    }, [onToggleCollapsed, thinkingId])

    if (!combinedContent || !thinkingId) {
      return null
    }

    return (
      <box>
        <Thinking
          content={combinedContent}
          isCollapsed={isCollapsed}
          onToggle={handleToggle}
          availableWidth={availWidth}
        />
      </box>
    )
  },
)
