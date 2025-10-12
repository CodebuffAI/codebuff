import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import type { ChatTheme } from '../utils/theme-system'

interface BranchItemProps {
  name: string
  content: ReactNode
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
  isCollapsed,
  isStreaming,
  branchChar,
  streamingPreview,
  finishedPreview,
  theme,
  onToggle,
}: BranchItemProps) => {
  const indentPrefix = branchChar ? branchChar.replace(/./g, ' ') : ''
  const cornerColor = theme.agentPrefix

  const isTextRenderable = (value: ReactNode): boolean => {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'boolean'
    ) {
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
            <box key={`expanded-array-${idx}`} style={{ flexDirection: 'column', gap: 0 }}>
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
    <box style={{ flexDirection: 'row', flexShrink: 0 }}>
      <text wrap={false}>{indentPrefix}</text>
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          flexShrink: 1,
          flexGrow: 1,
        }}
      >
        <box
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            backgroundColor: isCollapsed
              ? theme.agentResponseCount
              : theme.agentPrefix,
            paddingLeft: 1,
            paddingRight: 1,
          }}
          onMouseDown={onToggle}
        >
          <text wrap>
            <span fg={theme.agentToggleText}>
              {isCollapsed ? '▸ ' : '▾ '}
            </span>
            <span
              fg={theme.agentToggleText}
              attributes={TextAttributes.BOLD}
            >
              {name}
            </span>
          </text>
        </box>
        <box style={{ flexShrink: 1, marginBottom: 0 }}>
          {isStreaming && isCollapsed && streamingPreview && (
            <text
              key="streaming-preview"
              wrap
              fg={theme.agentText}
              attributes={TextAttributes.ITALIC}
            >
              {streamingPreview}
            </text>
          )}
          {!isStreaming && isCollapsed && finishedPreview && (
            <text
              key="finished-preview"
              wrap
              fg={theme.agentResponseCount}
              attributes={TextAttributes.ITALIC}
            >
              {finishedPreview}
            </text>
          )}
          {!isCollapsed && content && (
            <box style={{ flexDirection: 'column', gap: 0 }}>
              <box
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <text wrap={false} fg={cornerColor}>
                  ┌
                </text>
                <text wrap={false} fg={cornerColor}>
                  ┐
                </text>
              </box>
              <box
                style={{
                  flexDirection: 'row',
                  alignItems: 'stretch',
                }}
              >
                <text wrap={false} fg={cornerColor}>
                  │
                </text>
                <box
                  style={{
                    flexDirection: 'column',
                    gap: 0,
                    flexGrow: 1,
                    marginLeft: 1,
                    marginRight: 1,
                  }}
                >
                  {renderExpandedContent(content)}
                </box>
                <text wrap={false} fg={cornerColor}>
                  │
                </text>
              </box>
              <box
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <text wrap={false} fg={cornerColor}>
                  └
                </text>
                <text wrap={false} fg={cornerColor}>
                  ┘
                </text>
              </box>
            </box>
          )}
        </box>
      </box>
    </box>
  )
}
