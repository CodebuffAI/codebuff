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
        <text wrap fg={theme.agentText}>
          {value}
        </text>
      )
    }

    return value
  }

  return (
    <box style={{ flexDirection: 'row', flexShrink: 0 }}>
      <text wrap={false}>
        <span fg={theme.agentPrefix}>{branchChar}</span>
      </text>
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
              wrap
              fg={theme.agentText}
              attributes={TextAttributes.ITALIC}
            >
              {streamingPreview}
            </text>
          )}
          {!isStreaming && isCollapsed && finishedPreview && (
            <text
              wrap
              fg={theme.agentResponseCount}
              attributes={TextAttributes.ITALIC}
            >
              {finishedPreview}
            </text>
          )}
          {!isCollapsed && content && renderExpandedContent(content)}
        </box>
      </box>
    </box>
  )
}
