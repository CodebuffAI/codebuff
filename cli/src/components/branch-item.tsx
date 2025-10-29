import { TextAttributes, type BorderCharacters } from '@opentui/core'
import React, { type ReactNode } from 'react'

const borderCharsWithoutVertical: BorderCharacters = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: ' ',
  topT: ' ',
  bottomT: ' ',
  leftT: ' ',
  rightT: ' ',
  cross: ' ',
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
  branchChar: string
  streamingPreview: string
  finishedPreview: string
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
  branchChar,
  streamingPreview,
  finishedPreview,
  theme,
  onToggle,
}: BranchItemProps) => {
  const cornerColor = theme.agentPrefix
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
      }}
    >
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <RaisedPill
          segments={[
            { text: toggleLabel, fg: toggleIconColor },
            {
              text: name,
              fg: toggleLabelColor,
              attr: isExpanded ? TextAttributes.BOLD : undefined,
            },
          ]}
          frameColor={toggleFrameColor}
          textColor={toggleLabelColor}
          onPress={onToggle}
          style={{ alignSelf: 'flex-start' }}
        />
        <box style={{ flexShrink: 1, marginBottom: 0 }}>
          {isStreaming && isCollapsed && streamingPreview && (
            <text
              key="streaming-preview"
              fg={theme.agentText}
              attributes={TextAttributes.ITALIC}
            >
              {streamingPreview}
            </text>
          )}
          {!isStreaming && isCollapsed && finishedPreview && (
            <text
              key="finished-preview"
              fg={theme.agentResponseCount}
              attributes={TextAttributes.ITALIC}
            >
              {finishedPreview}
            </text>
          )}
          {!isCollapsed && (
            <box style={{ flexDirection: 'column', gap: 0 }}>
              {content && (
                <box
                  border
                  borderStyle="single"
                  borderColor={cornerColor}
                  customBorderChars={borderCharsWithoutVertical}
                  style={{
                    flexDirection: 'column',
                    gap: 0,
                    paddingLeft: 1,
                    paddingRight: 1,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  {prompt && (
                    <box style={{ flexDirection: 'column', gap: 0 }}>
                      <text fg={theme.agentToggleHeaderText}>Prompt</text>
                      <text fg={theme.agentText}>{prompt}</text>
                      <text> </text>
                      <text fg={theme.agentToggleHeaderText}>Response</text>
                    </box>
                  )}
                  {renderExpandedContent(content)}
                </box>
              )}
              <RaisedPill
                segments={[{ text: 'Collapse', fg: collapseButtonText }]}
                frameColor={collapseButtonFrame}
                textColor={collapseButtonText}
                onPress={onToggle}
                style={{ alignSelf: 'flex-end' }}
              />
            </box>
          )}
        </box>
      </box>
    </box>
  )
}
