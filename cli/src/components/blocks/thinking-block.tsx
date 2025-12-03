import { memo, useCallback } from 'react'

import { Thinking } from '../thinking'

import type { ContentBlock } from '../../types/chat'

interface ThinkingBlockProps {
  blocks: Extract<ContentBlock, { type: 'text' }>[]
  keyPrefix: string
  startIndex: number
  indentLevel: number
  onToggleCollapsed: (id: string) => void
  availableWidth: number
}

export const ThinkingBlock = memo(
  ({
    blocks,
    keyPrefix,
    startIndex,
    indentLevel,
    onToggleCollapsed,
    availableWidth,
  }: ThinkingBlockProps) => {
    const thinkingId = `${keyPrefix}-thinking-${startIndex}`
    const combinedContent = blocks
      .map((b) => b.content)
      .join('')
      .trim()

    const firstBlock = blocks[0]
    const isCollapsed = firstBlock?.isCollapsed ?? true
    const marginLeft = Math.max(0, indentLevel * 2)
    const availWidth = Math.max(10, availableWidth - marginLeft - 4)

    const handleToggle = useCallback(() => {
      onToggleCollapsed(thinkingId)
    }, [onToggleCollapsed, thinkingId])

    if (!combinedContent) {
      return null
    }

    return (
      <box style={{ marginLeft }}>
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
