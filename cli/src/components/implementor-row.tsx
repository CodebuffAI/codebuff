import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { memo, useMemo, useState, useCallback } from 'react'

import { useTheme } from '../hooks/use-theme'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import {
  buildActivityTimeline,
  getImplementorDisplayName,
  getImplementorIndex,
  type TimelineItem,
} from '../utils/implementor-helpers'
import { computeSmartColumns } from '../utils/layout-helpers'
import { Button } from './button'
import { DiffViewer } from './tools/diff-viewer'
import type { AgentContentBlock, ContentBlock } from '../types/chat'

interface ImplementorGroupProps {
  implementors: AgentContentBlock[]
  siblingBlocks: ContentBlock[]
  onToggleCollapsed: (id: string) => void
  availableWidth: number
}

/**
 * Responsive card grid for comparing implementor proposals
 */
export const ImplementorGroup = memo(
  ({
    implementors,
    siblingBlocks,
    availableWidth,
  }: ImplementorGroupProps) => {
    const theme = useTheme()
    const { width } = useTerminalLayout()
    
    // Determine max columns based on terminal width
    const maxColumns = useMemo(() => {
      if (width.is('xs')) return 1
      if (width.is('sm')) return 2
      if (width.is('md')) return 3
      return 4 // lg
    }, [width])

    // Smart column selection based on item count
    const columns = useMemo(() => 
      computeSmartColumns(implementors.length, maxColumns),
    [implementors.length, maxColumns])
    
    // Calculate card width based on columns and available space
    const cardWidth = useMemo(() => {
      const gap = 2
      const totalGaps = columns - 1
      const usableWidth = availableWidth - (totalGaps * gap)
      return Math.floor(usableWidth / columns)
    }, [availableWidth, columns])
    
    // Masonry layout: distribute items to columns round-robin style
    // (simpler than height-based, but still gives masonry effect)
    const columnGroups = useMemo(() => {
      const result: AgentContentBlock[][] = Array.from({ length: columns }, () => [])
      implementors.forEach((impl, idx) => {
        result[idx % columns].push(impl)
      })
      return result
    }, [implementors, columns])

    // Check if any implementors are still running
    const anyRunning = implementors.some(impl => impl.status === 'running')
    const headerText = anyRunning
      ? `${pluralize(implementors.length, 'proposal')} being generated`
      : `${pluralize(implementors.length, 'proposal')} generated`

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 1,
          width: '100%',
          marginTop: 1,
        }}
      >
        <text
          fg={theme.muted}
          attributes={TextAttributes.DIM}
        >
          {headerText}
        </text>
        
        {/* Masonry layout: columns side by side, cards stack vertically in each */}
        <box
          style={{
            flexDirection: 'row',
            gap: 2,
            width: '100%',
            alignItems: 'flex-start',
          }}
        >
          {columnGroups.map((columnItems, colIdx) => (
            <box
              key={`col-${colIdx}`}
              style={{
                flexDirection: 'column',
                gap: 1,
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: 0, // Allow shrinking below content size
              }}
            >
              {columnItems.map((agentBlock) => {
                const implementorIndex = getImplementorIndex(
                  agentBlock.agentId,
                  agentBlock.agentType,
                  siblingBlocks,
                )
                
                return (
                  <ImplementorCard
                    key={agentBlock.agentId}
                    agentBlock={agentBlock}
                    implementorIndex={implementorIndex}
                    cardWidth={cardWidth}
                  />
                )
              })}
            </box>
          ))}
        </box>
      </box>
    )
  },
)

interface ImplementorCardProps {
  agentBlock: AgentContentBlock
  implementorIndex?: number
  cardWidth: number
}

/**
 * Individual proposal card with dashed border
 */
// Show one item at a time for cleaner pagination
const ITEMS_PER_PAGE = 1

const ImplementorCard = memo(
  ({
    agentBlock,
    implementorIndex,
    cardWidth,
  }: ImplementorCardProps) => {
    const theme = useTheme()
    const [currentPage, setCurrentPage] = useState(0)

    const isStreaming = agentBlock.status === 'running'
    const isComplete = agentBlock.status === 'complete'
    const isFailed = agentBlock.status === 'failed'

    const displayName = getImplementorDisplayName(
      agentBlock.agentType,
      implementorIndex,
    )
    // Always build the timeline (no expand/collapse state)
    const timeline = buildActivityTimeline(agentBlock.blocks)
    const totalPages = Math.ceil(timeline.length / ITEMS_PER_PAGE)

    // Status indicator and color - matching subagent design
    const statusIndicator = isStreaming ? '●' : isFailed ? '✗' : isComplete ? '✓' : '○'
    const statusLabel = isStreaming
      ? 'running'
      : isFailed
        ? 'failed'
        : isComplete
          ? 'completed'
          : 'waiting'
    const statusColor = isStreaming
      ? theme.primary
      : isFailed
        ? 'red'
        : isComplete
          ? 'green'
          : theme.muted
    // Format: "● running" when streaming, "completed ✓" when done (checkmark at end)
    const statusText = statusIndicator === '✓'
      ? `${statusLabel} ${statusIndicator}`
      : `${statusIndicator} ${statusLabel}`

    // Dashed border chars for "proposal" visual distinction
    // Using light double dash characters (U+254C, U+254E) which have the same weight
    // as the light box drawing corners (┌ ┐ └ ┘)
    const dashedBorderChars = {
      topLeft: '╭',   // Rounded corner for softer proposal look
      topRight: '╮',
      bottomLeft: '╰',
      bottomRight: '╯',
      horizontal: '┈', // Light quadruple dash horizontal (evenly spaced dashes)
      vertical: '┊',   // Light quadruple dash vertical (evenly spaced dashes)
      topT: '┬',
      bottomT: '┴',
      leftT: '├',
      rightT: '┤',
      cross: '┼',
    }

    // Use cardWidth for internal truncation calculations (approximate internal space)
    const innerWidth = Math.max(10, cardWidth - 4)

    const goToPrev = useCallback(() => {
      setCurrentPage(prev => Math.max(0, prev - 1))
    }, [])

    const goToNext = useCallback(() => {
      setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))
    }, [totalPages])

    return (
      <box
        border
        borderStyle="single"
        customBorderChars={dashedBorderChars}
        borderColor={isComplete ? theme.muted : theme.primary}
        style={{
          flexDirection: 'column',
          flexGrow: 1,
          flexShrink: 1,
          minWidth: 0,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
        }}
      >
        {/* Header: Model name + Status on first row, draft proposal on second */}
        <box style={{ flexDirection: 'column', width: '100%' }}>
          {/* First row: Name + Status */}
          <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
            <text
              fg={theme.foreground}
              attributes={TextAttributes.BOLD}
              style={{ wrapMode: 'none' }}
            >
              {displayName}
            </text>
            <text fg={statusColor} attributes={TextAttributes.DIM} style={{ wrapMode: 'none' }}>
              {statusText}
            </text>
          </box>
          {/* Second row: draft proposal + pagination */}
          <box style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <text fg={theme.muted} attributes={TextAttributes.DIM} style={{ wrapMode: 'none' }}>
              draft proposal
            </text>
            {/* Pagination controls */}
            {totalPages > 1 && (
              <box style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
                <Button
                  onClick={goToPrev}
                  disabled={currentPage === 0}
                  style={{ paddingLeft: 0, paddingRight: 1 }}
                >
                  <text fg={currentPage === 0 ? theme.muted : theme.primary}>◀</text>
                </Button>
                <text fg={theme.muted} attributes={TextAttributes.DIM}>
                  {currentPage + 1}/{totalPages}
                </text>
                <Button
                  onClick={goToNext}
                  disabled={currentPage >= totalPages - 1}
                  style={{ paddingLeft: 1, paddingRight: 0 }}
                >
                  <text fg={currentPage >= totalPages - 1 ? theme.muted : theme.primary}>▶</text>
                </Button>
              </box>
            )}
          </box>
        </box>

        {/* Timeline content - always shown */}
        {timeline.length > 0 ? (
          <TimelineContent
            timeline={timeline}
            currentPage={currentPage}
            itemsPerPage={ITEMS_PER_PAGE}
            innerWidth={innerWidth}
          />
        ) : (
          /* Status text for empty/in-progress */
          <text fg={theme.muted} attributes={TextAttributes.ITALIC} style={{ marginTop: 1 }}>
            {isStreaming ? 'generating...' : 'waiting...'}
          </text>
        )}
      </box>
    )
  },
)

interface TimelineContentProps {
  timeline: TimelineItem[]
  currentPage: number
  itemsPerPage: number
  innerWidth: number
}

const TimelineContent = memo(
  ({ timeline, currentPage, itemsPerPage, innerWidth }: TimelineContentProps) => {
    const startIdx = currentPage * itemsPerPage
    const endIdx = Math.min(startIdx + itemsPerPage, timeline.length)
    const currentItems = timeline.slice(startIdx, endIdx)

    return (
      <box style={{ flexDirection: 'column', width: '100%' }}>
        {/* Current page item */}
        {currentItems.map((item, idx) => (
          <TimelineItemView
            key={`timeline-${startIdx + idx}`}
            item={item}
            availableWidth={innerWidth}
          />
        ))}
      </box>
    )
  }
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
          {truncateFilePath(item.content, availableWidth)}
        </span>
      </text>
      {item.diff && !item.isCreate && (
        <box
          style={{
            marginTop: 0,
            marginLeft: 0,
            width: '100%',
          }}
        >
          <DiffViewer diffText={item.diff} />
        </box>
      )}
    </box>
  )
})

/**
 * Truncate file path to fit within width, keeping the filename visible
 */
function truncateFilePath(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path
  
  const parts = path.split('/')
  const filename = parts[parts.length - 1]
  
  // If just the filename is too long, truncate it
  if (filename.length >= maxWidth - 3) {
    return '...' + filename.slice(-(maxWidth - 3))
  }
  
  // Otherwise, show .../parent/filename
  const remaining = maxWidth - filename.length - 4 // for "..." and "/"
  if (remaining > 0 && parts.length > 1) {
    const parent = parts[parts.length - 2]
    if (parent.length <= remaining) {
      return '.../' + parent + '/' + filename
    }
  }
  
  return '.../' + filename
}

// Keep the old exports for backward compatibility during transition
export { ImplementorCard as ImplementorRow }
