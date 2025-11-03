import { TextAttributes, type BorderCharacters } from '@opentui/core'
import React, { type ReactNode } from 'react'

import type { ChatTheme } from '../types/theme-system'

const borderCharsWithoutVertical: BorderCharacters = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: ' ',
  topT: ' ',
  bottomT: ' ',
  leftT: ' ',
  rightT: ' ',
  cross: ' ',
}

interface BranchItemProps {
  name: string
  content: ReactNode
  prompt?: string
  agentId?: string
  isCollapsed: boolean
  isStreaming: boolean
  branchChar: string
  streamingPreview: string
  finishedPreview: string
  theme: ChatTheme
  onToggle: () => void
}

export const BranchItem = ({
  name,
  content,
  prompt,
  agentId,
  isCollapsed,
  isStreaming,
  branchChar,
  streamingPreview,
  finishedPreview,
  theme,
  onToggle,
}: BranchItemProps) => {
  const cornerColor = theme.agentPrefix

  const toggleBackground = isStreaming
    ? theme.agentToggleHeaderBg
    : isCollapsed
      ? theme.agentResponseCount
      : theme.agentPrefix
  const toggleTextColor =
    (isStreaming ? theme.agentToggleHeaderText : theme.agentToggleText) ??
    theme.agentToggleText
  const toggleLabel = `${isCollapsed ? '▸' : '▾'} `

  const isTextRenderable = (value: ReactNode): boolean => {
    if (value === null || value === undefined || typeof value === 'boolean') {
      return false
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return true
    }

    if (Array.isArray(value)) {
      return value.every((child) => isTextRenderable(child))
    }

    if (React.isValidElement(value)) {
      if (value.type === React.Fragment) {
        return isTextRenderable(value.props.children)
      }

      if (typeof value.type === 'string') {
        if (
          value.type === 'span' ||
          value.type === 'strong' ||
          value.type === 'em'
        ) {
          return isTextRenderable(value.props.children)
        }

        return false
      }
    }

    return false
  }

  const renderExpandedContent = (value: ReactNode): ReactNode => {
    if (
      value === null ||
      value === undefined ||
      value === false ||
      value === true
    ) {
      return null
    }

    if (isTextRenderable(value)) {
      return (
        <text wrap fg={theme.agentText} key="expanded-text">
          {value}
        </text>
      )
    }

    if (React.isValidElement(value)) {
      if (value.key === null || value.key === undefined) {
        return (
          <box key="expanded-node" style={{ flexDirection: 'column', gap: 0 }}>
            {value}
          </box>
        )
      }
      return value
    }

    if (Array.isArray(value)) {
      return (
        <box key="expanded-array" style={{ flexDirection: 'column', gap: 0 }}>
          {value.map((child, idx) => (
            <box
              key={`expanded-array-${idx}`}
              style={{ flexDirection: 'column', gap: 0 }}
            >
              {child}
            </box>
          ))}
        </box>
      )
    }

    return (
      <box key="expanded-unknown" style={{ flexDirection: 'column', gap: 0 }}>
        {value}
      </box>
    )
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        flexShrink: 0,
        marginTop: 1,
        marginBottom: 1,
      }}
    >
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <box
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            backgroundColor: toggleBackground,
            paddingLeft: 1,
            paddingRight: 1,
          }}
          onMouseDown={onToggle}
        >
          <text wrap>
            <span fg={toggleTextColor}>{toggleLabel}</span>
            <span fg={toggleTextColor} attributes={TextAttributes.BOLD}>
              {name}
            </span>
          </text>
        </box>
        <box style={{ flexShrink: 1, marginBottom: 0 }}>
          {isCollapsed &&
            (isStreaming ? streamingPreview : finishedPreview) && (
              <text
                key={isStreaming ? 'streaming-preview' : 'finished-preview'}
                wrap
                fg={isStreaming ? theme.agentText : theme.agentResponseCount}
                attributes={TextAttributes.ITALIC}
              >
                {isStreaming ? streamingPreview : finishedPreview}
              </text>
            )}
          {!isCollapsed && (
            <box style={{ flexDirection: 'column', gap: 1 }}>
              {content && (
                <box
                  border
                  borderStyle="single"
                  borderColor={cornerColor}
                  customBorderChars={borderCharsWithoutVertical}
                  style={{
                    flexDirection: 'column',
                    gap: 0,
                    paddingLeft: 1,
                    paddingRight: 1,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  {prompt && (
                    <box style={{ flexDirection: 'column', gap: 0 }}>
                      <text wrap fg={theme.agentToggleHeaderText}>
                        Prompt
                      </text>
                      <text wrap fg={theme.agentText}>
                        {prompt}
                      </text>
                      <text> </text>
                      <text wrap fg={theme.agentToggleHeaderText}>
                        Response
                      </text>
                    </box>
                  )}
                  {renderExpandedContent(content)}
                </box>
              )}
              <box
                style={{
                  alignSelf: 'flex-end',
                  backgroundColor: theme.agentFocusedBg,
                  paddingLeft: 1,
                  paddingRight: 1,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
                onMouseDown={onToggle}
              >
                <text wrap={false}>
                  <span fg={toggleTextColor} attributes={TextAttributes.BOLD}>
                    Collapse
                  </span>
                </text>
              </box>
            </box>
          )}
        </box>
      </box>
    </box>
  )
}
