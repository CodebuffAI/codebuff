import { TextAttributes } from '@opentui/core'
import React, { type ReactNode } from 'react'

import type { ChatTheme } from './theme-system'

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
          <text wrap={false}>
            <span fg={theme.agentToggleText}>
              {isCollapsed ? '▸' : '▾'}{' '}
            </span>
          </text>
          <box style={{ flexShrink: 1 }}>
            <text wrap>
              <span
                fg={theme.agentToggleText}
                attributes={TextAttributes.BOLD}
              >
                {name}
              </span>
            </text>
          </box>
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
          {!isCollapsed && content && (
            <text wrap fg={theme.agentContentText}>
              {content}
            </text>
          )}
        </box>
      </box>
    </box>
  )
}
