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
    // Pad to exactly PREVIEW_LINE_COUNT lines for consistent height while streaming.
    const previewLines = [...lines]
    while (previewLines.length < PREVIEW_LINE_COUNT) {
      previewLines.push('')
    }

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
        <box
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
          }}
        >
          <text
            style={{ wrapMode: 'none', attributes: TextAttributes.BOLD }}
            fg={theme.foreground}
          >
            • Thinking
          </text>
        </box>
        {isCollapsed ? (
          previewLines.length > 0 && (
            <box
              style={{
                flexDirection: 'row',
                gap: 0,
                alignItems: 'stretch',
                marginTop: 0,
              }}
            >
              <box
                style={{
                  width: 1,
                  backgroundColor: theme.muted,
                  marginTop: 0,
                  marginBottom: 0,
                }}
              />
              <box
                style={{
                  paddingLeft: 1,
                  flexGrow: 1,
                }}
              >
                <text
                  style={{
                    wrapMode: 'word',
                    fg: theme.muted,
                  }}
                  attributes={TextAttributes.ITALIC}
                >
                  {(hasMore ? '...' : '') + previewLines.join(' ')}
                </text>
              </box>
            </box>
          )
        ) : (
          <box
            style={{
              flexDirection: 'row',
              gap: 0,
              alignItems: 'stretch',
              marginTop: 0,
            }}
          >
            <box
              style={{
                width: 1,
                backgroundColor: theme.muted,
                marginTop: 0,
                marginBottom: 0,
              }}
            />
            <box style={{ paddingLeft: 1, flexGrow: 1 }}>
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
          </box>
        )}
      </Button>
    )
  },
)
