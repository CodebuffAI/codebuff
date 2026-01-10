import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { memo, useMemo, useState, useCallback } from 'react'

import { getAgentStatusInfo } from '../utils/agent-helpers'
import {
  buildActivityTimeline,
  getImplementorDisplayName,
  getImplementorIndex,
  getFileStatsFromBlocks,
  truncateWithEllipsis,
  type FileStats,
} from '../utils/implementor-helpers'
import { useTheme } from '../hooks/use-theme'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { computeSmartColumns } from '../utils/layout-helpers'
import { getRelativePath } from '../utils/path-helpers'
import { PROPOSAL_BORDER_CHARS } from '../utils/ui-constants'
import { Button } from './button'
import { CollapseButton } from './collapse-button'
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
      if (width.is('sm')) return 1
      if (width.is('md')) return 2
      return 3 // lg
    }, [width])

    // Smart column selection based on item count
    const columns = useMemo(() => 
      computeSmartColumns(implementors.length, maxColumns),
    [implementors.length, maxColumns])
    
    // Calculate card width based on columns and available space
    const cardWidth = useMemo(() => {
      // No gap between columns - cards are flush
      return Math.floor(availableWidth / columns)
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
            gap: 1, // Small horizontal gap to balance visual weight with vertical double-borders
            width: '100%',
            alignItems: 'flex-start',
          }}
        >
          {columnGroups.map((columnItems, colIdx) => (
            <box
              key={`col-${colIdx}`}
              style={{
                flexDirection: 'column',
                gap: 0,
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: 0, // Allow shrinking below content size
              }}
            >
              {columnItems.map((agentBlock) => {
                const implementorIndex = getImplementorIndex(
                  agentBlock,
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
 * Click file rows to view their diffs
 */
const ImplementorCard = memo(
  ({
    agentBlock,
    implementorIndex,
    cardWidth,
  }: ImplementorCardProps) => {
    const theme = useTheme()
    const [selectedFile, setSelectedFile] = useState<string | null>(null)

    const isComplete = agentBlock.status === 'complete'

    const displayName = getImplementorDisplayName(
      agentBlock.agentType,
      implementorIndex,
    )

    // Get file stats for compact view
    const fileStats = useMemo(
      () => getFileStatsFromBlocks(agentBlock.blocks),
      [agentBlock.blocks]
    )

    // Build timeline to extract diffs
    const timeline = useMemo(
      () => buildActivityTimeline(agentBlock.blocks),
      [agentBlock.blocks]
    )

    // Build map of file path -> diff for inline display
    const fileDiffs = useMemo(() => {
      const diffs = new Map<string, string>()
      for (const item of timeline) {
        if (item.type === 'edit' && item.diff) {
          diffs.set(item.content, item.diff)
        }
      }
      return diffs
    }, [timeline])

    // Get status info from helper
    const { indicator: statusIndicator, label: statusLabel, color: statusColor } = getAgentStatusInfo(
      agentBlock.status,
      theme,
    )
    // Format: "● running" when streaming, "completed ✓" when done (checkmark at end)
    const statusText = statusIndicator === '✓'
      ? `${statusLabel} ${statusIndicator}`
      : `${statusIndicator} ${statusLabel}`

    // Use cardWidth for internal truncation calculations (approximate internal space)
    const innerWidth = Math.max(10, cardWidth - 4)

    // Toggle file selection - clicking same file deselects it
    const handleFileSelect = useCallback((filePath: string) => {
      setSelectedFile(prev => prev === filePath ? null : filePath)
    }, [])

    return (
      <box
        border
        borderStyle="single"
        customBorderChars={PROPOSAL_BORDER_CHARS}
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
        {/* Header: Model name + Status */}
        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1, width: '100%' }}>
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

        {/* Prompt provided to this proposal */}
        {agentBlock.initialPrompt && (
          <box style={{ marginTop: 1, width: '100%' }}>
            <text
              fg={theme.muted}
              attributes={TextAttributes.ITALIC}
            >
              {agentBlock.initialPrompt}
            </text>
          </box>
        )}

        {/* File stats - click file name to view diff inline */}
        {fileStats.length > 0 && (
          <CompactFileStats
            fileStats={fileStats}
            availableWidth={innerWidth}
            selectedFile={selectedFile}
            onSelectFile={handleFileSelect}
            fileDiffs={fileDiffs}
          />
        )}

        {/* No file edits yet */}
        {fileStats.length === 0 && timeline.length > 0 && (
          <text fg={theme.muted} attributes={TextAttributes.ITALIC} style={{ marginTop: 1 }}>
            No file changes yet
          </text>
        )}

        {/* No content at all */}
        {fileStats.length === 0 && timeline.length === 0 && (
          <text fg={theme.muted} attributes={TextAttributes.ITALIC} style={{ marginTop: 1 }}>
            {agentBlock.status === 'running' ? 'generating...' : 'waiting...'}
          </text>
        )}
      </box>
    )
  },
)

// ============================================================================
// COMPACT FILE STATS VIEW
// ============================================================================

interface CompactFileStatsProps {
  fileStats: FileStats[]
  availableWidth: number
  selectedFile: string | null
  onSelectFile: (filePath: string) => void
  /** Map of file path to diff content */
  fileDiffs: Map<string, string>
}

/**
 * Compact view showing file changes with center-aligned addition/deletion bars
 * Click a file name to view its diff inline below that row
 *
 * Layout:
 * M handler.ts    ██████████ +30  -5 ░░░   2 hunks
 * A utils.ts          ████ +15            1 hunk
 *   [diff content shown here when selected]
 * M config.ts           ██  +2  -1 ░      1 hunk
 */
const CompactFileStats = memo(({
  fileStats,
  availableWidth,
  selectedFile,
  onSelectFile,
  fileDiffs,
}: CompactFileStatsProps) => {
  const theme = useTheme()

  if (fileStats.length === 0) {
    return (
      <text fg={theme.muted} attributes={TextAttributes.ITALIC}>
        No file changes yet
      </text>
    )
  }

  // Calculate max values for proportional bar sizing
  const maxAdded = Math.max(...fileStats.map(f => f.stats.linesAdded), 1)
  const maxRemoved = Math.max(...fileStats.map(f => f.stats.linesRemoved), 1)
  const maxLines = Math.max(maxAdded, maxRemoved)

  // Fixed bar width - keeps layout simple and predictable
  const maxBarWidth = 5

  // Calculate max string widths for alignment (so all bars meet at center axis)
  // Always include +0/-0 in width calculation since we always show them
  const maxAddedStrWidth = Math.max(
    ...fileStats.map(f => `+${f.stats.linesAdded}`.length),
    2 // Minimum "+0"
  )
  const maxRemovedStrWidth = Math.max(
    ...fileStats.map(f => `-${f.stats.linesRemoved}`.length),
    2 // Minimum "-0"
  )

  return (
    <box style={{ flexDirection: 'column', marginTop: 1 }}>
      {fileStats.map((file, idx) => (
        <CompactFileRow
          key={`${file.path}-${idx}`}
          file={file}
          availableWidth={availableWidth}
          maxBarWidth={maxBarWidth}
          maxLines={maxLines}
          maxAddedStrWidth={maxAddedStrWidth}
          maxRemovedStrWidth={maxRemovedStrWidth}
          isSelected={selectedFile === file.path}
          onSelect={() => onSelectFile(file.path)}
          diff={fileDiffs.get(file.path)}
        />
      ))}
    </box>
  )
})

interface CompactFileRowProps {
  file: FileStats
  availableWidth: number
  maxBarWidth: number
  maxLines: number
  maxAddedStrWidth: number
  maxRemovedStrWidth: number
  isSelected: boolean
  onSelect: () => void
  diff?: string
}

/**
 * Single file row with center-aligned bars
 * Layout: M  filename  ████+4  -2░░   2 hunks
 * Bar visualization is fixed, file path flexes/truncates to fit
 * Bars meet at a center axis with proper padding for alignment across all rows
 * File name is underlined on hover, clickable to show diff inline below
 */
const CompactFileRow = memo(({
  file,
  availableWidth,
  maxBarWidth,
  maxLines,
  maxAddedStrWidth,
  maxRemovedStrWidth,
  isSelected,
  onSelect,
  diff,
}: CompactFileRowProps) => {
  const theme = useTheme()
  const [isHovered, setIsHovered] = useState(false)
  const { linesAdded, linesRemoved } = file.stats

  // Calculate bar widths proportional to line counts
  const addedBarWidth = linesAdded > 0
    ? Math.max(1, Math.round((linesAdded / maxLines) * maxBarWidth))
    : 0
  const removedBarWidth = linesRemoved > 0
    ? Math.max(1, Math.round((linesRemoved / maxLines) * maxBarWidth))
    : 0

  // Build bar strings - use spaces since we're using background colors
  const addedBarSpaces = ' '.repeat(addedBarWidth)
  const removedBarSpaces = ' '.repeat(removedBarWidth)

  // Format numbers - always show counts, including +0 and -0
  const addedStr = `+${linesAdded}`
  const removedStr = `-${linesRemoved}`

  // Calculate left padding for center alignment
  // Left padding: space for missing bar width + missing number width
  // This ensures all "+N" values align at a center axis
  const leftPadding = ' '.repeat(
    (maxBarWidth - addedBarWidth) + (maxAddedStrWidth - addedStr.length)
  )
  // No right padding needed - bars extend to the edge of the card

  // Calculate available width for file path
  // Layout: changeType(1) + spaces(2) + filePath + spaces(2) + hunks + spaces(2) + bars
  const hunkText = `${file.stats.hunks} ${file.stats.hunks === 1 ? 'hunk' : 'hunks'}`
  const barWidth = maxBarWidth + maxAddedStrWidth + 1 + 1 + maxRemovedStrWidth + maxBarWidth // bars + numbers + spaces between
  const fixedWidth = 1 + 2 + 2 + hunkText.length + 2 + barWidth
  const maxFilePathWidth = Math.max(10, availableWidth - fixedWidth)
  
  // Get and truncate file path
  const relativePath = getRelativePath(file.path)
  const displayPath = truncateWithEllipsis(relativePath, maxFilePathWidth)

  return (
    <box style={{ flexDirection: 'column' }}>
      {/* File row */}
      <box style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Change type: fixed */}
        <text fg={theme.muted} style={{ flexShrink: 0 }}>{file.changeType}</text>
        <text style={{ flexShrink: 0 }}>  </text>

        {/* File path: clickable with underline on hover, flexes to push bars right */}
        <Button
          onClick={onSelect}
          onMouseOver={() => setIsHovered(true)}
          onMouseOut={() => setIsHovered(false)}
          style={{
            paddingLeft: 0,
            paddingRight: 0,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minWidth: 0,
          }}
        >
          <text
            fg={theme.foreground}
            attributes={isHovered || isSelected ? TextAttributes.UNDERLINE : undefined}
            style={{
              wrapMode: 'none',
            }}
          >
            {displayPath}
          </text>
        </Button>
        <text style={{ flexShrink: 0 }}>  </text>

        {/* Hunk count */}
        <text fg={theme.muted} style={{ flexShrink: 0, wrapMode: 'none' }}>
          {file.stats.hunks} {file.stats.hunks === 1 ? 'hunk' : 'hunks'}
        </text>
        <text style={{ flexShrink: 0 }}>  </text>

        {/* Bar visualization: left-padded for center alignment, extends to edge */}
        <text style={{ flexShrink: 0, wrapMode: 'none' }}>
          <span>{leftPadding}</span>
          <span fg={theme.inputFocusedFg} bg={theme.success}>{addedBarSpaces}{addedStr} </span>
          <span fg={theme.inputFocusedFg} bg={theme.error}> {removedStr}{removedBarSpaces}</span>
        </text>
      </box>

      {/* Inline diff viewer when selected - aligns with card content (full width) */}
      {isSelected && diff && (
        <box style={{ flexDirection: 'column', marginTop: 1, width: '100%' }}>
          <box
            style={{
              flexDirection: 'column',
              width: '100%',
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 1,
              paddingBottom: 1,
              backgroundColor: theme.surface,
            }}
          >
            <DiffViewer diffText={diff} />
          </box>
          <CollapseButton onClick={onSelect} />
        </box>
      )}
    </box>
  )
})

// Keep the old exports for backward compatibility during transition
export { ImplementorCard as ImplementorRow }
