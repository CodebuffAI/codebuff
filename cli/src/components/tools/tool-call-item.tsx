import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'
import stringWidth from 'string-width'

import { useTheme } from '../../hooks/use-theme'

import type { ChatTheme } from '../../types/theme-system'

interface ToolCallItemProps {
  name: string
  content: ReactNode
  isCollapsed: boolean
  isStreaming: boolean
  streamingPreview: string
  finishedPreview: string
  onToggle?: () => void
  titleSuffix?: string
  dense?: boolean
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
}

export const SimpleToolCallItem = ({
  name,
  description,
}: SimpleToolCallItemProps) => {
  const theme = useTheme()
  const bulletChar = '• '

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
      <text style={{ wrapMode: 'word' }}>
        <span fg={theme.foreground}>{bulletChar}</span>
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
  streamingPreview,
  finishedPreview,
  onToggle,
  titleSuffix,
  dense = false,
}: ToolCallItemProps) => {
  const theme = useTheme()

  const baseTextAttributes = theme.messageTextAttributes ?? 0
  const getAttributes = (extra: number = 0): number | undefined => {
    const combined = baseTextAttributes | extra
    return combined === 0 ? undefined : combined
  }

  const isExpanded = !isCollapsed
  const bulletChar = '• '
  const toggleIndicator = onToggle ? (isCollapsed ? '▸ ' : '▾ ') : ''
  const toggleLabel = onToggle ? toggleIndicator : bulletChar
  // Width in cells of the toggle label (toggle arrow or bullet). Used to align
  // expanded content directly under the toggle icon.
  const toggleIndent = stringWidth(toggleLabel)
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
            paddingBottom: isCollapsed ? 0 : dense ? 0 : 1,
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
              // Indent expanded content underneath the toggle icon
              paddingLeft: toggleIndent,
              paddingRight: dense ? 0 : toggleIndent,
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
