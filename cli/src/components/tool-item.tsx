import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import type { ChatTheme } from '../utils/theme-system'

interface ToolItemProps {
  name: string
  titleAccessory?: ReactNode
  content: ReactNode
  isCollapsed: boolean
  isStreaming: boolean
  streamingPreview: string
  finishedPreview: string
  theme: ChatTheme
  onToggle: () => void
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
  onToggle,
}: ToolItemProps) => {
  const toggleColor = theme.statusSecondary
  const toggleIcon = isCollapsed ? '▸' : '▾'
  const previewColor = isStreaming ? theme.agentText : theme.agentResponseCount
  const hasTitleAccessory =
    titleAccessory !== undefined &&
    titleAccessory !== null &&
    !(typeof titleAccessory === 'string' && titleAccessory.length === 0)

  return (
    <box style={{ flexDirection: 'column', gap: 0 }}>
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
          <span fg={toggleColor}>{toggleIcon} </span>
          <span fg={toggleColor} attributes={TextAttributes.BOLD}>
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
      {isCollapsed ? (
        (isStreaming && streamingPreview) || (!isStreaming && finishedPreview) ? (
          <box
            style={{
              paddingLeft: 3,
              paddingRight: 1,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            <text fg={previewColor} attributes={TextAttributes.ITALIC}>
              {isStreaming ? streamingPreview : finishedPreview}
            </text>
          </box>
        ) : null
      ) : (
        <box
          style={{
            flexDirection: 'column',
            gap: 0,
            paddingLeft: 3,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          {renderContent(content, theme)}
        </box>
      )}
    </box>
  )
}
