import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import type { ChatTheme } from '../utils/theme-system'
import { resolveThemeColor } from '../utils/theme-system'

interface ToolCallItemProps {
  name: string
  content: ReactNode
  isCollapsed: boolean
  isStreaming: boolean
  branchChar: string
  streamingPreview: string
  finishedPreview: string
  theme: ChatTheme
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
  fallbackTextColor: string,
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
        fg={resolveThemeColor(theme.agentText) ?? fallbackTextColor}
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
        <box key="tool-expanded-node" style={{ flexDirection: 'column', gap: 0 }}>
          {value}
        </box>
      )
    }
    return value
  }

  if (Array.isArray(value)) {
    return (
      <box key="tool-expanded-array" style={{ flexDirection: 'column', gap: 0 }}>
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
    <box key="tool-expanded-unknown" style={{ flexDirection: 'column', gap: 0 }}>
      {value}
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
  theme,
  onToggle,
  titleSuffix,
}: ToolCallItemProps) => {
  const resolveFg = (
    color?: string | null,
    fallback?: string | null,
  ): string | undefined => {
    if (color && color !== 'default') return color
    if (fallback && fallback !== 'default') return fallback
    return undefined
  }

  const fallbackTextColor =
    resolveFg(theme.agentContentText) ??
    resolveFg(theme.chromeText) ??
    '#d1d5e5'

  const baseTextAttributes = theme.messageTextAttributes ?? 0
  const getAttributes = (extra: number = 0): number | undefined => {
    const combined = baseTextAttributes | extra
    return combined === 0 ? undefined : combined
  }

  const isExpanded = !isCollapsed
  const toggleLabelColor = theme.chromeText ?? theme.agentToggleHeaderBg
  const toggleIndicator = onToggle ? (isCollapsed ? '▸ ' : '▾ ') : ''
  const toggleLabel = `${branchChar}${toggleIndicator}`
  const toggleLabelFg = resolveFg(toggleLabelColor, fallbackTextColor)
  const headerFg = resolveFg(theme.agentToggleHeaderText, fallbackTextColor)
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
              {...(toggleLabelFg ? { fg: toggleLabelFg } : undefined)}
              attributes={isExpanded ? TextAttributes.BOLD : undefined}
            >
              {toggleLabel}
            </span>
            <span
              {...(headerFg ? { fg: headerFg } : undefined)}
              attributes={TextAttributes.BOLD}
            >
              {name}
            </span>
            {titleSuffix ? (
              <span
                {...(headerFg ? { fg: headerFg } : undefined)}
                attributes={TextAttributes.BOLD}
              >
                {` ${titleSuffix}`}
              </span>
            ) : null}
            {isStreaming ? (
              <span
                fg={resolveFg(theme.statusAccent, fallbackTextColor)}
                attributes={TextAttributes.DIM}
              >
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
                fg={resolveFg(
                  isStreaming ? theme.agentText : theme.agentResponseCount,
                  fallbackTextColor,
                )}
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
            {renderExpandedContent(
              content,
              theme,
              fallbackTextColor ?? '#d1d5e5',
              getAttributes,
            )}
          </box>
        )}
      </box>
    </box>
  )
}
