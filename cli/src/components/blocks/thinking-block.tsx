import { memo, useCallback } from 'react'

import { Thinking } from '../thinking'

import type { ContentBlock } from '../../types/chat'

// Nested thinking blocks need more offset to account for the subagent's border and padding
const WIDTH_OFFSET = 8
const NESTED_WIDTH_OFFSET = 12

interface ThinkingBlockProps {
  blocks: Extract<ContentBlock, { type: 'text' }>[]
  keyPrefix: string
  startIndex: number
  onToggleCollapsed: (id: string) => void
  availableWidth: number
  isNested: boolean
}

export const ThinkingBlock = memo(
  ({
    blocks,
    keyPrefix,
    startIndex,
    onToggleCollapsed,
    availableWidth,
    isNested,
  }: ThinkingBlockProps) => {
    const thinkingId = `${keyPrefix}-thinking-${startIndex}`
    const combinedContent = blocks
      .map((b) => b.content)
      .join('')
      .trim()

    const firstBlock = blocks[0]
    const isCollapsed = firstBlock?.isCollapsed ?? true
    const offset = isNested ? NESTED_WIDTH_OFFSET : WIDTH_OFFSET
    const availWidth = Math.max(10, availableWidth - offset)

    const handleToggle = useCallback(() => {
      onToggleCollapsed(thinkingId)
    }, [onToggleCollapsed, thinkingId])

    if (!combinedContent) {
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
