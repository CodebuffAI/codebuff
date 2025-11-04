import { TextAttributes, type BorderCharacters } from '@opentui/core'
import React, { type ReactNode } from 'react'

import { RaisedPill } from './raised-pill'
import { useTheme } from '../hooks/use-theme'

interface AgentBranchItemProps {
  name: string
  content: ReactNode
  prompt?: string
  agentId?: string
  isCollapsed: boolean
  isStreaming: boolean
  branchChar?: string
  streamingPreview: string
  finishedPreview: string
  statusLabel?: string
  statusColor?: string
  statusIndicator?: string
  onToggle?: () => void
  titleSuffix?: string
}

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

export const AgentBranchItem = ({
  name,
  content,
  prompt,
  agentId,
  isCollapsed,
  isStreaming,
  streamingPreview,
  finishedPreview,
  branchChar = '',
  statusLabel,
  statusColor,
  statusIndicator = '●',
  onToggle,
  titleSuffix,
}: AgentBranchItemProps) => {
  const theme = useTheme()

  const baseTextAttributes = theme.messageTextAttributes ?? 0
  const getAttributes = (extra: number = 0): number | undefined => {
    const combined = baseTextAttributes | extra
    return combined === 0 ? undefined : combined
  }

  const isExpanded = !isCollapsed
  const toggleFrameColor = isExpanded
    ? theme.agentToggleExpandedBg
    : theme.muted
  const toggleIconColor = isStreaming ? theme.primary : theme.foreground
  const toggleIndicator = onToggle ? (isCollapsed ? '▸ ' : '▾ ') : ''
  const toggleLabel = `${branchChar}${toggleIndicator}`
  const collapseButtonFrame = theme.agentToggleExpandedBg
  const collapseButtonText = collapseButtonFrame
  const statusText =
    statusLabel && statusLabel.length > 0
      ? statusIndicator === '✓'
        ? `${statusLabel} ${statusIndicator}`
        : `${statusIndicator} ${statusLabel}`
      : null
  const showCollapsedPreview =
    (isStreaming && !!streamingPreview) || (!isStreaming && !!finishedPreview)

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
        <text
          fg={theme.foreground}
          key="expanded-text"
          attributes={getAttributes()}
        >
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
        marginTop: 0,
        marginBottom: 0,
        paddingBottom: 0,
        width: '100%',
      }}
    >
      <box
        border
        borderStyle="single"
        borderColor={toggleFrameColor}
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
              paddingLeft: 0,
              paddingRight: 0,
              paddingTop: 0,
              paddingBottom: 0,
              width: '100%',
            }}
          >
            <text fg={theme.foreground}>Prompt</text>
            <text
              fg={theme.foreground}
              style={{ wrapMode: 'word' }}
              attributes={getAttributes()}
            >
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
            paddingBottom: isCollapsed ? 0 : 1,
            width: '100%',
          }}
          onMouseDown={onToggle}
        >
          <text style={{ wrapMode: 'none' }}>
            <span fg={toggleIconColor}>
              {toggleLabel}
            </span>
            <span
              fg={theme.foreground}
              attributes={isExpanded ? TextAttributes.BOLD : undefined}
            >
              {name}
            </span>
            {titleSuffix ? (
              <span
                fg={theme.foreground}
                attributes={TextAttributes.BOLD}
              >
                {` ${titleSuffix}`}
              </span>
            ) : null}
            {statusText ? (
              <span
                fg={statusColor ?? theme.muted}
                attributes={TextAttributes.DIM}
              >
                {` ${statusText}`}
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
                {isStreaming ? streamingPreview : finishedPreview}
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
            {prompt && (
              <box
                style={{
                  flexDirection: 'column',
                  gap: 0,
                  marginBottom: content ? 1 : 0,
                }}
              >
                <text fg={theme.foreground}>
                  Prompt
                </text>
                <text
                  fg={theme.foreground}
                  style={{ wrapMode: 'word' }}
                  attributes={getAttributes()}
                >
                  {prompt}
                </text>
                {content && (
                  <text
                    fg={theme.foreground}
                    style={{ marginTop: 1 }}
                  >
                    Response
                  </text>
                )}
              </box>
            )}
            {renderExpandedContent(content)}
            {onToggle && (
              <box
                style={{
                  alignSelf: 'flex-end',
                  marginTop: content ? 0 : 1,
                  paddingRight: 1,
                  paddingBottom: 0,
                  marginBottom: 0,
                }}
              >
                <RaisedPill
                  segments={[{ text: 'Collapse', fg: collapseButtonText }]}
                  frameColor={collapseButtonFrame}
                  textColor={collapseButtonText}
                  onPress={onToggle}
                />
              </box>
            )}
          </box>
        )}
      </box>
    </box>
  )
}
