import { TextAttributes } from '@opentui/core'
import React, { memo } from 'react'

import { useTheme } from '../hooks/use-theme'
import { Button } from './button'
import { DiffViewer } from './tools/diff-viewer'
import {
  buildActivityTimeline,
  countEdits,
  getImplementorDisplayName,
  getImplementorIndex,
  getLatestCommentary,
  type TimelineItem,
} from '../utils/implementor-helpers'
import { BORDER_CHARS } from '../utils/ui-constants'
import type { AgentContentBlock, ContentBlock } from '../types/chat'

interface ImplementorGroupProps {
  implementors: AgentContentBlock[]
  siblingBlocks: ContentBlock[]
  onToggleCollapsed: (id: string) => void
  availableWidth: number
}

/**
 * Wraps multiple implementor agents in a bordered box with a header
 */
export const ImplementorGroup = memo(
  ({
    implementors,
    siblingBlocks,
    onToggleCollapsed,
    availableWidth,
  }: ImplementorGroupProps) => {
    const theme = useTheme()
    const count = implementors.length
    const headerText = `${count} agent${count !== 1 ? 's' : ''} implementing`

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          width: '100%',
          marginTop: 1,
        }}
      >
        <text
          fg={theme.muted}
          attributes={TextAttributes.DIM}
          style={{ marginBottom: 0 }}
        >
          {headerText}
        </text>
        <box
          border
          borderStyle="single"
          borderColor={theme.muted}
          customBorderChars={BORDER_CHARS}
          style={{
            flexDirection: 'column',
            gap: 0,
            width: '100%',
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          {implementors.map((agentBlock, idx) => {
            const implementorIndex = getImplementorIndex(
              agentBlock.agentId,
              agentBlock.agentType,
              siblingBlocks,
            )
            const isExpanded = agentBlock.isCollapsed === false

            return (
              <ImplementorRow
                key={agentBlock.agentId}
                agentBlock={agentBlock}
                implementorIndex={implementorIndex}
                isExpanded={isExpanded}
                onToggleExpand={() => onToggleCollapsed(agentBlock.agentId)}
                availableWidth={availableWidth - 4}
              />
            )
          })}
        </box>
      </box>
    )
  },
)

interface ImplementorRowProps {
  agentBlock: AgentContentBlock
  implementorIndex?: number
  isExpanded: boolean
  onToggleExpand: () => void
  availableWidth: number
}

/**
 * Compact row display for a single implementor agent
 * Shows: ▸ ● Model    N edits   "commentary..."
 * Expands to show full activity timeline with diffs
 */
export const ImplementorRow = memo(
  ({
    agentBlock,
    implementorIndex,
    isExpanded,
    onToggleExpand,
    availableWidth,
  }: ImplementorRowProps) => {
    const theme = useTheme()

    const isStreaming = agentBlock.status === 'running'
    const isComplete = agentBlock.status === 'complete'
    const isFailed = agentBlock.status === 'failed'

    const displayName = getImplementorDisplayName(
      agentBlock.agentType,
      implementorIndex,
    )
    const editCount = countEdits(agentBlock.blocks)
    const latestCommentary = getLatestCommentary(agentBlock.blocks)
    const timeline = isExpanded
      ? buildActivityTimeline(agentBlock.blocks)
      : []

    // Status indicator
    const statusIndicator = isStreaming
      ? '●'
      : isFailed
        ? '✗'
        : isComplete
          ? '✓'
          : '○'
    const statusColor = isStreaming
      ? theme.primary
      : isFailed
        ? 'red'
        : isComplete
          ? theme.foreground
          : theme.muted

    // Expand toggle
    const toggleIndicator = isExpanded ? '▾' : '▸'

    // Calculate available width for commentary
    // Format: "▸ ● Model    N edits   "commentary..."
    // Fixed parts: toggle(2) + status(2) + model(~12) + count(~10) + padding(4) ≈ 30
    const fixedWidth = 30 + displayName.length
    const maxCommentaryWidth = Math.max(10, availableWidth - fixedWidth)

    // Truncate commentary to fit
    const truncatedCommentary = latestCommentary
      ? latestCommentary.length > maxCommentaryWidth
        ? latestCommentary.slice(0, maxCommentaryWidth - 3) + '...'
        : latestCommentary
      : undefined

    // Edit count text
    const editText = editCount === 1 ? '1 edit' : `${editCount} edits`

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          width: '100%',
        }}
      >
        {/* Collapsed row header */}
        <Button
          onClick={onToggleExpand}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: '100%',
            paddingLeft: 0,
          }}
        >
          {/* Toggle + Status column */}
          <text style={{ wrapMode: 'none', width: 4 }}>
            <span fg={theme.foreground}>{toggleIndicator} </span>
            <span fg={statusColor}>{statusIndicator}</span>
          </text>
          {/* Model name column - fixed width for alignment */}
          <text
            fg={theme.foreground}
            attributes={TextAttributes.BOLD}
            style={{ wrapMode: 'none', width: 12 }}
          >
            {displayName}
          </text>
          {/* Edit count column - fixed width */}
          <text fg={theme.muted} style={{ wrapMode: 'none', width: 10 }}>
            {editText}
          </text>
          {/* Commentary column - fills remaining space */}
          {!isExpanded && truncatedCommentary && (
            <text
              fg={theme.foreground}
              attributes={TextAttributes.ITALIC}
              style={{ wrapMode: 'none', flexGrow: 1 }}
            >
              "{truncatedCommentary}"
            </text>
          )}
          {!isExpanded && isComplete && !truncatedCommentary && (
            <text fg={theme.muted} style={{ wrapMode: 'none' }}>
              Complete
            </text>
          )}
          {!isExpanded && isFailed && !truncatedCommentary && (
            <text fg="red" style={{ wrapMode: 'none' }}>
              Failed
            </text>
          )}
        </Button>

        {/* Expanded content */}
        {isExpanded && (
          <box
            style={{
              flexDirection: 'column',
              gap: 0,
              paddingLeft: 4,
              paddingTop: 0,
              paddingBottom: 1,
              width: '100%',
            }}
          >
            {timeline.map((item, idx) => (
              <TimelineItemView
                key={`timeline-${idx}`}
                item={item}
                availableWidth={availableWidth - 4}
              />
            ))}
            {timeline.length === 0 && (
              <text fg={theme.muted} attributes={TextAttributes.ITALIC}>
                No activity yet...
              </text>
            )}
            <Button
              onClick={onToggleExpand}
              style={{
                alignSelf: 'flex-end',
                marginTop: 1,
              }}
            >
              <text fg={theme.secondary} style={{ wrapMode: 'none' }}>
                ▴ collapse
              </text>
            </Button>
          </box>
        )}
      </box>
    )
  },
)

interface TimelineItemViewProps {
  item: TimelineItem
  availableWidth: number
}

const TimelineItemView = memo(({ item, availableWidth }: TimelineItemViewProps) => {
  const theme = useTheme()

  if (item.type === 'commentary') {
    return (
      <box style={{ marginTop: 1, marginBottom: 1, width: '100%' }}>
        <text
          fg={theme.foreground}
          attributes={TextAttributes.ITALIC}
          style={{ wrapMode: 'word' }}
        >
          "{item.content}"
        </text>
      </box>
    )
  }

  // Edit item - show file path and diff
  const editIcon = item.isCreate ? '+ ' : '✎ '

  return (
    <box style={{ flexDirection: 'column', gap: 0, marginTop: 1, width: '100%' }}>
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.foreground}>{editIcon}</span>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {item.content}
        </span>
      </text>
      {item.diff && !item.isCreate && (
        <box
          style={{
            marginTop: 0,
            marginLeft: 2,
            width: '100%',
          }}
        >
          <DiffViewer diffText={item.diff} />
        </box>
      )}
    </box>
  )
})
