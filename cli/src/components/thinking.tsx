import { TextAttributes } from '@opentui/core'
import React, { memo, type ReactNode } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { getLastNVisualLines } from '../utils/text-layout'

interface ThinkingProps {
  content: string
  isCollapsed: boolean
  onToggle: () => void
  availableWidth?: number
}

export const Thinking = memo(
  ({ content, isCollapsed, onToggle, availableWidth }: ThinkingProps): ReactNode => {
    const theme = useTheme()
    const { contentMaxWidth } = useTerminalDimensions()

    const width = Math.max(10, Math.min((availableWidth ?? contentMaxWidth), 120))
    const { lines: lastLines, hasMore } = getLastNVisualLines(content, width, 3)
    const collapsedText = (hasMore ? '...\n' : '') + lastLines.join('\n')

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          marginTop: 1,
          marginBottom: 1,
        }}
      >
        <box
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            backgroundColor: theme.muted,
            paddingLeft: 1,
            paddingRight: 1,
          }}
          onMouseDown={onToggle}
        >
          <text style={{ wrapMode: 'none' }}>
            <span fg={theme.foreground}>{isCollapsed ? '▸ ' : '▾ '}</span>
            <span fg={theme.foreground} attributes={TextAttributes.ITALIC}>
              Thinking
            </span>
          </text>
        </box>
        {isCollapsed && collapsedText && (
          <box style={{ flexShrink: 1, marginTop: 0 }}>
            <text
              style={{
                wrapMode: 'word',
                fg: theme.muted,
              }}
              attributes={TextAttributes.ITALIC}
            >
              {collapsedText}
            </text>
          </box>
        )}
        {!isCollapsed && (
          <box style={{ flexShrink: 1, marginTop: 0 }}>
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
      </box>
    )
  },
)
