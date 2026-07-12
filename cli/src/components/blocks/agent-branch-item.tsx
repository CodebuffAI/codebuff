import { TextAttributes } from '@opentui/core'
import React, { memo, type ReactNode } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { useWhyDidYouUpdateById } from '../../hooks/use-why-did-you-update'
import { getCliEnv } from '../../utils/env'
import { MAX_COLLAPSED_LINES, truncateToLines } from '../../utils/strings'
import { wrapTextPreservingNewlines } from '../../utils/text-layout'
import { BORDER_CHARS } from '../../utils/ui-constants'
import { Button } from '../button'
import { CollapseButton } from '../collapse-button'
import { ShimmerText } from '../shimmer-text'

interface AgentBranchItemProps {
  name: string
  children?: ReactNode
  prompt?: string
  agentId?: string
  isCollapsed: boolean
  isStreaming: boolean
  /** Preview text shown when collapsed (empty string = no preview) */
  preview: string
  statusLabel?: string
  statusColor?: string
  statusIndicator?: string
  onToggle?: () => void
  titleSuffix?: string
  /**
   * Available width (in cols) the agent branch may occupy.
   * Used to hard-wrap long unbroken tokens (paths, URLs) in the
   * preview and prompt so they don't overflow the column.
   */
  availableWidth?: number
}

export const AgentBranchItem = memo((props: AgentBranchItemProps) => {
  const {
    name,
    children,
    prompt,
    agentId,
    isCollapsed,
    isStreaming,
    preview,
    statusLabel,
    statusColor,
    statusIndicator = '●',
    onToggle,
    titleSuffix,
    availableWidth,
  } = props

  // Reserve room for the border (1 char each side) and the inner padding (1
  // char each side) so wrapped content stays inside the agent card.
  const innerColWidth = Math.max(10, (availableWidth ?? 80) - 4)
  const truncatedPreview = truncateToLines(preview, MAX_COLLAPSED_LINES) ?? ''
  const wrappedPreview =
    truncatedPreview.length > 0
      ? wrapTextPreservingNewlines(truncatedPreview, innerColWidth)
      : ''
  // Prompt sits next to a 1-col vertical line plus 1 col of padding inside
  // the expanded card body, so it gets a slightly tighter budget.
  const wrappedPrompt = prompt
    ? wrapTextPreservingNewlines(prompt, Math.max(10, innerColWidth - 2))
    : ''
  useWhyDidYouUpdateById('AgentBranchItem', agentId ?? '', props, {
    logLevel: 'debug',
    enabled: getCliEnv().CODEBUFF_PERF_TEST === 'true',
  })
  const theme = useTheme()

  const baseTextAttributes = theme.messageTextAttributes ?? 0
  const getAttributes = (extra: number = 0): number | undefined => {
    const combined = baseTextAttributes | extra
    return combined === 0 ? undefined : combined
  }

  const isExpanded = !isCollapsed
  const toggleFrameColor = isExpanded ? theme.secondary : theme.muted
  const toggleIconColor = isStreaming ? theme.primary : theme.foreground
  const bulletChar = '• '
  const toggleIndicator = onToggle ? (isCollapsed ? '▸ ' : '▾ ') : ''
  const toggleLabel = onToggle ? toggleIndicator : bulletChar
  const statusText =
    statusLabel && statusLabel.length > 0
      ? statusIndicator === '✓'
        ? `${statusLabel} ${statusIndicator}`
        : `${statusIndicator} ${statusLabel}`
      : null
  const showCollapsedPreview = preview.length > 0

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
      const elProps = value.props as Record<string, unknown>
      if (value.type === React.Fragment) {
        return isTextRenderable(elProps.children as ReactNode)
      }

      if (typeof value.type === 'string') {
        if (
          value.type === 'span' ||
          value.type === 'strong' ||
          value.type === 'em'
        ) {
          return isTextRenderable(elProps.children as ReactNode)
        }

        return false
      }
    }

    return false
  }

  const boundedColumnStyle = {
    flexDirection: 'column' as const,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    width: '100%' as const,
    overflow: 'hidden' as const,
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
      const expandedValue =
        typeof value === 'string' || typeof value === 'number'
          ? wrapTextPreservingNewlines(String(value), innerColWidth)
          : value

      return (
        <text
          fg={theme.foreground}
          key="expanded-text"
          attributes={getAttributes()}
        >
          {expandedValue}
        </text>
      )
    }

    if (React.isValidElement(value)) {
      return (
        <box
          key={value.key ?? 'expanded-node'}
          style={{ ...boundedColumnStyle, gap: 1 }}
        >
          {value}
        </box>
      )
    }

    if (Array.isArray(value)) {
      return (
        <box key="expanded-array" style={{ ...boundedColumnStyle, gap: 1 }}>
          {value.map((child, idx) => (
            <box
              key={`expanded-array-${idx}`}
              style={{ ...boundedColumnStyle, gap: 0 }}
            >
              {child}
            </box>
          ))}
        </box>
      )
    }

    return (
      <box key="expanded-unknown" style={{ ...boundedColumnStyle, gap: 1 }}>
        {value}
      </box>
    )
  }

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        marginTop: 0,
        marginBottom: 0,
        paddingBottom: 0,
        flexGrow: 0,
        minWidth: 0,
        width: availableWidth ?? '100%',
        overflow: 'hidden',
        flexShrink: 1,
      }}
    >
      <box
        border
        borderStyle="single"
        borderColor={toggleFrameColor}
        customBorderChars={BORDER_CHARS}
        style={{
          flexDirection: 'column',
          gap: 0,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          flexGrow: 1,
          minWidth: 0,
          flexShrink: 1,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <Button
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}
          onClick={onToggle}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={toggleIconColor}>{toggleLabel}</span>
            <span
              fg={theme.foreground}
              attributes={isExpanded ? TextAttributes.BOLD : undefined}
            >
              {name}
            </span>
            {titleSuffix ? (
              <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
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
        </Button>

        {isCollapsed ? (
          showCollapsedPreview ? (
            <Button
              style={{
                paddingLeft: 1,
                paddingRight: 1,
                paddingTop: 0,
                paddingBottom: 0,
                flexGrow: 1,
                minWidth: 0,
              }}
              onClick={onToggle}
            >
              <text
                fg={isStreaming ? theme.foreground : theme.muted}
                attributes={getAttributes(TextAttributes.ITALIC)}
                style={{ wrapMode: 'word' }}
              >
                {wrappedPreview}
              </text>
            </Button>
          ) : null
        ) : (
          <box
            style={{
              ...boundedColumnStyle,
              gap: 0,
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 0,
              paddingBottom: 0,
              width: '100%',
              overflow: 'hidden',
            }}
          >
            {prompt && (
              <box
                style={{
                  flexDirection: 'row',
                  gap: 0,
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  alignItems: 'stretch',
                  marginBottom: children ? 1 : 0,
                  width: '100%',
                  overflow: 'hidden',
                }}
              >
                <box
                  style={{
                    width: 1,
                    backgroundColor: theme.aiLine,
                    marginTop: 0,
                    marginBottom: 0,
                  }}
                />
                <box
                  style={{
                    paddingLeft: 1,
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  <text
                    fg={theme.foreground}
                    style={{ wrapMode: 'word' }}
                    attributes={getAttributes(TextAttributes.ITALIC)}
                  >
                    {wrappedPrompt}
                  </text>
                </box>
              </box>
            )}
            {renderExpandedContent(children)}
            {onToggle && <CollapseButton onClick={onToggle} />}
          </box>
        )}
        {isStreaming && isExpanded && (
          <box
            style={{
              paddingLeft: 1,
              paddingBottom: 0,
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            <text>
              <ShimmerText
                text="working..."
                interval={160}
                primaryColor={theme.secondary}
              />
            </text>
          </box>
        )}
      </box>
    </box>
  )
})
