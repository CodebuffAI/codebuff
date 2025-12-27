import { TextAttributes } from '@opentui/core'
import React, { memo, type ReactNode } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { getLastNVisualLines } from '../utils/text-layout'

const PREVIEW_LINE_COUNT = 3

interface ThinkingProps {
  content: string
  isCollapsed: boolean
  onToggle: () => void
  availableWidth?: number
}

export const Thinking = memo(
  ({
    content,
    isCollapsed,
    onToggle,
    availableWidth,
  }: ThinkingProps): ReactNode => {
    const theme = useTheme()
    const { contentMaxWidth } = useTerminalDimensions()

    const width = Math.max(10, Math.min(availableWidth ?? contentMaxWidth, 120))
    // Normalize content to single line for consistent preview
    const normalizedContent = content.replace(/\n+/g, ' ').trim()
    const { lines, hasMore } = getLastNVisualLines(
      normalizedContent,
      width,
      PREVIEW_LINE_COUNT,
    )

    return (
      <Button
        style={{
          flexDirection: 'column',
          gap: 0,
          marginTop: 0,
          marginBottom: 0,
        }}
        onClick={onToggle}
      >
        <text style={{ fg: theme.foreground }}>
          <span>• </span>
          <span attributes={TextAttributes.BOLD}>Thinking</span>
        </text>
        {isCollapsed ? (
          lines.length > 0 && (
            <box style={{ paddingLeft: 2 }}>
              <text
                style={{
                  wrapMode: 'word',
                  fg: theme.muted,
                }}
                attributes={TextAttributes.ITALIC}
              >
                {hasMore ? '...' + lines.join(' ') : lines.join(' ')}
              </text>
            </box>
          )
        ) : (
          <box style={{ paddingLeft: 2 }}>
            <text
              style={{
                wrapMode: 'word',
                fg: theme.muted,
              }}
              attributes={TextAttributes.ITALIC}
            >
              {content}
            </text>
          </box>
        )}
      </Button>
    )
  },
)
