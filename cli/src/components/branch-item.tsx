import { TextAttributes, type BorderCharacters } from '@opentui/core'
import React, { type ReactNode } from 'react'

const containerBorderChars: BorderCharacters = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  topT: '┬',
  bottomT: '┴',
  leftT: '├',
  rightT: '┤',
  cross: '┼',
}

import type { ChatTheme } from '../utils/theme-system'
import { RaisedPill } from './raised-pill'

interface BranchItemProps {
  name: string
  content: ReactNode
  prompt?: string
  agentId?: string
  isCollapsed: boolean
  isStreaming: boolean
  streamingPreview: string
  finishedPreview: string
  availableWidth: number
  statusLabel?: string
  statusColor?: string
  statusIndicator?: string
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
  streamingPreview,
  finishedPreview,
  statusLabel,
  statusColor,
  statusIndicator = '●',
  theme,
  onToggle,
}: BranchItemProps) => {
  const resolveFg = (
    color?: string,
    fallback?: string,
  ): string | undefined => {
    if (color && color !== 'default') return color
    if (fallback && fallback !== 'default') return fallback
    return undefined
  }
  const fallbackTextColor =
    resolveFg(theme.agentContentText) ??
    resolveFg(theme.chromeText) ??
    '#d1d5e5'

  const isExpanded = !isCollapsed
  const toggleFrameColor = isExpanded
    ? theme.agentToggleExpandedBg
    : theme.agentToggleHeaderBg
  const toggleIconColor = isStreaming
    ? theme.statusAccent
    : toggleFrameColor
  const toggleLabelColor = toggleFrameColor
  const toggleLabel = `${isCollapsed ? '▸' : '▾'} `
  const collapseButtonFrame = theme.agentToggleExpandedBg
  const collapseButtonText = collapseButtonFrame
  const toggleFrameFg = resolveFg(toggleFrameColor, fallbackTextColor)
  const toggleIconFg = resolveFg(toggleIconColor, fallbackTextColor)
  const toggleLabelFg = resolveFg(toggleLabelColor, fallbackTextColor)
  const headerFg = resolveFg(theme.agentToggleHeaderText, fallbackTextColor)
  const statusText =
    statusLabel && statusLabel.length > 0
      ? statusIndicator === '✓'
        ? `${statusLabel} ${statusIndicator}`
        : `${statusIndicator} ${statusLabel}`
      : null

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
        <text fg={theme.agentText} key="expanded-text">
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
        marginBottom: 0,
        width: '100%',
      }}
    >
      <box
        border
        borderStyle="single"
        borderColor={toggleFrameFg ?? undefined}
        customBorderChars={containerBorderChars}
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
        {prompt ? (
          <box
            style={{
              flexDirection: 'column',
              gap: 0,
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 0,
              paddingBottom: 0,
              width: '100%',
            }}
          >
            <text {...(headerFg ? { fg: headerFg } : undefined)}>Prompt</text>
            <text fg={theme.agentText} style={{ wrapMode: 'word' }}>
              {prompt}
            </text>
          </box>
        ) : null}
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            width: '100%',
          }}
          onMouseDown={onToggle}
        >
          <text style={{ wrapMode: 'none' }}>
            <span {...(toggleIconFg ? { fg: toggleIconFg } : undefined)}>
              {toggleLabel}
            </span>
            <span
              {...(toggleLabelFg ? { fg: toggleLabelFg } : undefined)}
              attributes={isExpanded ? TextAttributes.BOLD : undefined}
            >
              {name}
            </span>
            {statusText ? (
              <span
                fg={statusColor ?? theme.agentResponseCount}
                attributes={TextAttributes.DIM}
              >
                {` ${statusText}`}
              </span>
            ) : null}
          </text>
        </box>

        {isCollapsed ? (
          (isStreaming && streamingPreview) || (!isStreaming && finishedPreview) ? (
            <box
              style={{
                paddingLeft: 1,
                paddingRight: 1,
                paddingTop: 0,
                paddingBottom: 1,
              }}
            >
              <text
                fg={isStreaming ? theme.agentText : theme.agentResponseCount}
                attributes={TextAttributes.ITALIC}
              >
                {isStreaming ? streamingPreview : finishedPreview}
              </text>
            </box>
          ) : null
        ) : (
          <box
            style={{
              flexDirection: 'column',
              gap: 1,
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            {prompt && (
              <box
                style={{
                  flexDirection: 'column',
                  gap: 0,
                  marginBottom: content ? 1 : 0,
                }}
              >
                <text {...(headerFg ? { fg: headerFg } : undefined)}>Prompt</text>
                <text fg={theme.agentText} style={{ wrapMode: 'word' }}>
                  {prompt}
                </text>
                {content && (
                  <text
                    {...(headerFg ? { fg: headerFg } : undefined)}
                    style={{ marginTop: 1 }}
                  >
                    Response
                  </text>
                )}
              </box>
            )}
            {renderExpandedContent(content)}
            <box style={{ alignSelf: 'flex-end', marginTop: content ? 0 : 1 }}>
              <RaisedPill
                segments={[{ text: 'Collapse', fg: collapseButtonText }]}
                frameColor={collapseButtonFrame}
                textColor={collapseButtonText}
                padding={0}
                onPress={onToggle}
              />
            </box>
          </box>
        )}
      </box>
    </box>
  )
}
