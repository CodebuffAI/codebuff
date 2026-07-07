import { memo, useCallback } from 'react'

import { Thinking } from '../thinking'

import type { ContentBlock } from '../../types/chat'

// Parent components pass the exact content width available to the Thinking UI.
const WIDTH_OFFSET = 0
const NESTED_WIDTH_OFFSET = 0

interface ThinkingBlockProps {
  blocks: Extract<ContentBlock, { type: 'text' }>[]
  onToggleCollapsed: (id: string) => void
  availableWidth: number
  isNested: boolean
  /** Whether the parent message is complete (used to hide native reasoning blocks) */
  isMessageComplete: boolean
}

export const ThinkingBlock = memo(
  ({
    blocks,
    onToggleCollapsed,
    availableWidth,
    isNested,
    isMessageComplete,
  }: ThinkingBlockProps) => {
    const firstBlock = blocks[0]
    const thinkingId = firstBlock?.thinkingId
    const combinedContent = blocks
      .map((b) => b.content)
      .join('')
      .trim()

    const thinkingCollapseState = firstBlock?.thinkingCollapseState ?? 'preview'
    const offset = isNested ? NESTED_WIDTH_OFFSET : WIDTH_OFFSET
    const availWidth = Math.max(10, availableWidth - offset)

    const handleToggle = useCallback(() => {
      if (thinkingId) {
        onToggleCollapsed(thinkingId)
      }
    }, [onToggleCollapsed, thinkingId])

    // thinkingOpen === false means explicitly closed (with </think> tag or message completion)
    // Otherwise (true or undefined), completion is determined by message completion
    const isThinkingComplete =
      firstBlock?.thinkingOpen === false || isMessageComplete

    // Hide if no content or no thinkingId (but NOT when thinking is complete)
    if (!combinedContent || !thinkingId) {
      return null
    }

    return (
      <box
        style={{
          flexDirection: 'column',
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 0,
        }}
      >
        <Thinking
          content={combinedContent}
          thinkingCollapseState={thinkingCollapseState}
          isThinkingComplete={isThinkingComplete}
          onToggle={handleToggle}
          availableWidth={availWidth}
        />
      </box>
    )
  },
)
