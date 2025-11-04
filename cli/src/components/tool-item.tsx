import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import { useTheme } from '../hooks/use-theme'
import type { ChatTheme } from '../types/theme-system'

export interface ToolBranchMeta {
  hasPrevious: boolean
  hasNext: boolean
}

interface ToolItemProps {
  name: string
  titleAccessory?: ReactNode
  content: ReactNode
  isCollapsed: boolean
  isStreaming: boolean
  streamingPreview: string
  finishedPreview: string
  branchMeta: ToolBranchMeta
  onToggle: () => void
  titleColor?: string
}

const renderContent = (value: ReactNode, theme: ChatTheme): ReactNode => {
  const contentFg = theme.foreground
  const contentAttributes =
    theme.messageTextAttributes !== undefined && theme.messageTextAttributes !== 0
      ? theme.messageTextAttributes
      : undefined

  if (
    value === null ||
    value === undefined ||
    value === false ||
    value === true
  ) {
    return null
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return (
      <text
        fg={contentFg}
        style={{ wrapMode: 'word' }}
        attributes={contentAttributes}
      >
        {value}
      </text>
    )
  }

  if (Array.isArray(value)) {
    return (
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {value.map((child, index) => (
          <box key={index} style={{ flexDirection: 'column', gap: 0 }}>
            {renderContent(child, theme)}
          </box>
        ))}
      </box>
    )
  }

  if (React.isValidElement(value)) {
    return value
  }

  return (
    <text
      fg={contentFg}
      style={{ wrapMode: 'word' }}
      attributes={contentAttributes}
    >
      {value as any}
    </text>
  )
}

export const ToolItem = ({
  name,
  titleAccessory,
  content,
  isCollapsed,
  isStreaming,
  streamingPreview,
  finishedPreview,
  branchMeta,
  onToggle,
  titleColor: customTitleColor,
}: ToolItemProps) => {
  const theme = useTheme()

  const branchColor = theme.muted
  const branchAttributes = TextAttributes.DIM
  const titleColor = customTitleColor ?? theme.secondary
  const previewColor = isStreaming ? theme.foreground : theme.muted
  const baseTextAttributes = theme.messageTextAttributes ?? 0
  const connectorSymbol = branchMeta.hasNext ? '├' : '└'
  const continuationPrefix = branchMeta.hasNext ? '│ ' : '  '
  const showBranchAbove = branchMeta.hasPrevious
  const hasTitleAccessory =
    titleAccessory !== undefined && titleAccessory !== null

  const renderBranchSpacer = () => {
    if (!showBranchAbove) {
      return null
    }

    return (
      <box
        style={{
          flexDirection: 'row',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={branchColor} attributes={branchAttributes}>
            │
          </span>
        </text>
      </box>
    )
  }

  const renderConnectedSection = (node: ReactNode) => {
    if (!node) {
      return null
    }

    return (
      <box
        style={{
          flexDirection: 'row',
          gap: 0,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={branchColor} attributes={branchAttributes}>
            {continuationPrefix}
          </span>
        </text>
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
          {node}
        </box>
      </box>
    )
  }

  const renderedContent = renderContent(content, theme)
  const previewText = isStreaming ? streamingPreview : finishedPreview
  const hasPreview =
    typeof previewText === 'string' ? previewText.length > 0 : false
  const previewNode = hasPreview ? (
    <text
      fg={previewColor}
      attributes={(() => {
        const combined = baseTextAttributes | TextAttributes.ITALIC
        return combined === 0 ? undefined : combined
      })()}
    >
      {previewText}
    </text>
  ) : null

  return (
    <box style={{ flexDirection: 'column', gap: 0 }}>
      {renderBranchSpacer()}
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        onMouseDown={onToggle}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={branchColor} attributes={branchAttributes}>
            {`${connectorSymbol} `}
          </span>
          <span fg={titleColor} attributes={TextAttributes.BOLD}>
            {name}
          </span>
          {hasTitleAccessory && titleAccessory ? titleAccessory : null}
        </text>
      </box>
      {isCollapsed ? renderConnectedSection(previewNode) : null}
      {!isCollapsed ? renderConnectedSection(renderedContent) : null}
    </box>
  )
}
