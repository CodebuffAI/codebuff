import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import { useTheme } from '../../hooks/use-theme'

import type { ChatTheme } from '../../types/theme-system'

interface ToolCallItemProps {
  name: string
  content: ReactNode
  isCollapsed: boolean
  isStreaming: boolean
  branchChar: string
  streamingPreview: string
  finishedPreview: string
  onToggle?: () => void
  titleSuffix?: string
}

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

const renderExpandedContent = (
  value: ReactNode,
  theme: ChatTheme,
  getAttributes: (extra?: number) => number | undefined,
): ReactNode => {
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
      <text
        fg={theme.foreground}
        key="tool-expanded-text"
        attributes={getAttributes()}
      >
        {value}
      </text>
    )
  }

  if (React.isValidElement(value)) {
    if (value.key === null || value.key === undefined) {
      return (
        <box
          key="tool-expanded-node"
          style={{ flexDirection: 'column', gap: 0 }}
        >
          {value}
        </box>
      )
    }
    return value
  }

  if (Array.isArray(value)) {
    return (
      <box
        key="tool-expanded-array"
        style={{ flexDirection: 'column', gap: 0 }}
      >
        {value.map((child, idx) => (
          <box
            key={`tool-expanded-array-${idx}`}
            style={{ flexDirection: 'column', gap: 0 }}
          >
            {child}
          </box>
        ))}
      </box>
    )
  }

  return (
    <box
      key="tool-expanded-unknown"
      style={{ flexDirection: 'column', gap: 0 }}
    >
      {value}
    </box>
  )
}

interface SimpleToolCallItemProps {
  name: string
  description: string
  branchChar: string
}

export const SimpleToolCallItem = ({
  name,
  description,
  branchChar,
}: SimpleToolCallItemProps) => {
  const theme = useTheme()
  const bulletChar = '• '

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.foreground}>{branchChar || bulletChar}</span>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {name}
        </span>
        <span fg={theme.foreground}> {description}</span>
      </text>
    </box>
  )
}

export const ToolCallItem = ({
  name,
  content,
  isCollapsed,
  isStreaming,
  branchChar,
  streamingPreview,
  finishedPreview,
  onToggle,
  titleSuffix,
}: ToolCallItemProps) => {
  const theme = useTheme()

  const baseTextAttributes = theme.messageTextAttributes ?? 0
  const getAttributes = (extra: number = 0): number | undefined => {
    const combined = baseTextAttributes | extra
    return combined === 0 ? undefined : combined
  }

  const isExpanded = !isCollapsed
  const toggleIndicator = onToggle ? (isCollapsed ? '▸ ' : '▾ ') : ''
  const toggleLabel = `${branchChar}${toggleIndicator}`
  const collapsedPreviewText = isStreaming ? streamingPreview : finishedPreview
  const showCollapsedPreview = collapsedPreviewText.length > 0

  return (
    <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          width: '100%',
        }}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: isCollapsed ? 0 : 1,
            width: '100%',
          }}
          onMouseDown={onToggle}
        >
          <text style={{ wrapMode: 'none' }}>
            <span
              fg={theme.foreground}
              attributes={isExpanded ? TextAttributes.BOLD : undefined}
            >
              {toggleLabel}
            </span>
            <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
              {name}
            </span>
            {titleSuffix ? (
              <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
                {` ${titleSuffix}`}
              </span>
            ) : null}
            {isStreaming ? (
              <span fg={theme.primary} attributes={TextAttributes.DIM}>
                {' running'}
              </span>
            ) : null}
          </text>
        </box>

        {isCollapsed ? (
          showCollapsedPreview ? (
            <box
              style={{
                paddingLeft: 0,
                paddingRight: 0,
                paddingTop: 0,
                paddingBottom: 0,
              }}
            >
              <text
                fg={isStreaming ? theme.foreground : theme.muted}
                attributes={getAttributes(TextAttributes.ITALIC)}
              >
                {collapsedPreviewText}
              </text>
            </box>
          ) : null
        ) : (
          <box
            style={{
              flexDirection: 'column',
              gap: 0,
              paddingLeft: 0,
              paddingRight: 0,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            {renderExpandedContent(content, theme, getAttributes)}
          </box>
        )}
      </box>
    </box>
  )
}
