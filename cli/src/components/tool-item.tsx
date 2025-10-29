import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import type { ChatTheme } from '../utils/theme-system'

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
  theme: ChatTheme
  branchMeta: ToolBranchMeta
  onToggle: () => void
  titleColor?: string
}

const renderContent = (value: ReactNode, theme: ChatTheme): ReactNode => {
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
      <text fg={theme.agentContentText} style={{ wrapMode: 'word' }}>
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
    <text fg={theme.agentContentText} style={{ wrapMode: 'word' }}>
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
  theme,
  branchMeta,
  onToggle,
  titleColor: customTitleColor,
}: ToolItemProps) => {
  const branchColor = theme.agentResponseCount
  const branchAttributes = TextAttributes.DIM
  const titleColor = customTitleColor ?? theme.statusSecondary
  const previewColor = isStreaming ? theme.agentText : theme.agentResponseCount
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
          paddingLeft: 1,
          paddingRight: 1,
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
          paddingLeft: 1,
          paddingRight: 1,
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
    <text fg={previewColor} attributes={TextAttributes.ITALIC}>
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
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        onMouseDown={onToggle}
      >
        <text style={{ wrapMode: 'none' }}>
          <span fg={branchColor} attributes={branchAttributes}>
            {connectorSymbol}{' '}
          </span>
          <span fg={titleColor} attributes={TextAttributes.BOLD}>
            {name}
          </span>
          {hasTitleAccessory ? (
            <>
              {' '}
              {titleAccessory}
            </>
          ) : null}
        </text>
      </box>
      {isCollapsed ? renderConnectedSection(previewNode) : null}
      {!isCollapsed ? renderConnectedSection(renderedContent) : null}
    </box>
  )
}
