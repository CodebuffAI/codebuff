import React, { useEffect, useRef, useState } from 'react'
import stringWidth from 'string-width'

import { SegmentedControl } from './segmented-control'
import { useTheme } from '../hooks/use-theme'

import type { Segment } from './segmented-control'
import type { AgentMode } from '../utils/constants'

const MODE_LABELS: Record<AgentMode, string> = {
  FAST: 'FAST',
  MAX: 'MAX',
  PLAN: 'PLAN',
}

const ALL_MODES = Object.keys(MODE_LABELS) as AgentMode[]

export const OPEN_DELAY_MS = 100 // Delay before expanding on hover
export const CLOSE_DELAY_MS = 250 // Delay before collapsing when mouse leaves
export const REOPEN_SUPPRESS_MS = 250 // Time to block reopening after explicit close (prevents flicker)

/**
 * Manages the open/close state with hover delays and reopen suppression.
 * Provides timer-based state transitions to create smooth hover interactions.
 */
export function useHoverToggle() {
  const [isOpen, setIsOpen] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const openTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reopenBlockedUntilRef = useRef<number>(0)

  // Timer cleanup helpers
  const clearOpenTimer = () => {
    clearTimeout(openTimeoutRef.current!)
    openTimeoutRef.current = null
  }

  const clearCloseTimer = () => {
    clearTimeout(closeTimeoutRef.current!)
    closeTimeoutRef.current = null
  }

  const clearAllTimers = () => {
    clearOpenTimer()
    clearCloseTimer()
  }

  // State transition actions
  const openNow = () => {
    clearAllTimers()
    setIsOpen(true)
  }

  const closeNow = (suppressReopen = false) => {
    clearAllTimers()
    setIsOpen(false)
    if (suppressReopen) {
      reopenBlockedUntilRef.current = Date.now() + REOPEN_SUPPRESS_MS
    }
  }

  const scheduleOpen = () => {
    if (isOpen) return
    if (Date.now() < reopenBlockedUntilRef.current) return

    clearOpenTimer()
    openTimeoutRef.current = setTimeout(() => {
      openNow()
    }, OPEN_DELAY_MS)
  }

  const scheduleClose = () => {
    if (!isOpen) return

    clearCloseTimer()
    closeTimeoutRef.current = setTimeout(() => {
      closeNow()
    }, CLOSE_DELAY_MS)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimers()
  }, [])

  return {
    isOpen,
    openNow,
    closeNow,
    scheduleOpen,
    scheduleClose,
    // Expose individual timer clear helpers so callers can
    // cancel the opposite pending action during hover transitions.
    // These were used by the component but not returned previously,
    // causing runtime errors when hover events fired.
    clearOpenTimer,
    clearCloseTimer,
    clearAllTimers,
  }
}

/**
 * Builds the segment configuration for the expanded state.
 * Shows all modes plus an active indicator with reversed arrow.
 */
export function buildExpandedSegments(currentMode: AgentMode): Segment[] {
  return [
    // All mode options (disabled for current mode)
    ...ALL_MODES.map((m) => ({
      id: m,
      label: MODE_LABELS[m],
      isBold: false,
      disabled: m === currentMode,
    })),
    // Active mode indicator with reversed arrow
    {
      id: `active-${currentMode}`,
      label: `> ${MODE_LABELS[currentMode]}`,
      isSelected: true,
      defaultHighlighted: true,
    },
  ]
}

export type AgentModeClickAction =
  | { type: 'closeActive' }
  | { type: 'selectMode'; mode: AgentMode }
  | { type: 'toggleMode'; mode: AgentMode }

/**
 * Decide what high-level action a click on a segment should perform.
 * Extracted for unit testing and clarity.
 */
export const resolveAgentModeClick = (
  currentMode: AgentMode,
  clickedId: string,
  hasOnSelectMode: boolean,
): AgentModeClickAction => {
  if (clickedId.startsWith('active-')) return { type: 'closeActive' }
  const target = clickedId as AgentMode
  if (hasOnSelectMode) {
    return { type: 'selectMode', mode: target }
  }
  return { type: 'toggleMode', mode: target }
}

/**
 * AgentModeToggle
 *
 * Compact, hover-expandable segmented control for switching agent modes.
 * - Clicking the current mode toggles expansion (open/close)
 * - Clicking a different mode calls `onSelectMode` when provided,
 *   otherwise falls back to `onToggle`
 */
export const AgentModeToggle = ({
  mode,
  onToggle,
  onSelectMode,
}: {
  mode: AgentMode
  onToggle: () => void
  onSelectMode?: (mode: AgentMode) => void
}) => {
  const theme = useTheme()
  const [isCollapsedHovered, setIsCollapsedHovered] = useState(false)
  const hoverToggle = useHoverToggle()

  const handleCollapsedClick = () => {
    hoverToggle.clearAllTimers()
    if (hoverToggle.isOpen) {
      hoverToggle.closeNow(true)
    } else {
      hoverToggle.openNow()
    }
  }

  const handleMouseOver = () => {
    if (!hoverToggle.isOpen) setIsCollapsedHovered(true)
    // Cancel any pending close and schedule open with delay
    hoverToggle.clearCloseTimer()
    hoverToggle.scheduleOpen()
  }

  const handleMouseOut = () => {
    setIsCollapsedHovered(false)
    // Schedule close using the hook's configured delay
    hoverToggle.scheduleClose()
  }

  const handleSegmentClick = (id: string) => {
    const action = resolveAgentModeClick(mode, id, !!onSelectMode)
    if (action.type === 'closeActive') {
      hoverToggle.closeNow(true)
      return
    }
    if (action.type === 'selectMode') {
      onSelectMode?.(action.mode)
      hoverToggle.closeNow(true)
      return
    }
    // Toggle fallback (no onSelectMode provided)
    hoverToggle.clearAllTimers()
    onToggle()
    hoverToggle.closeNow(true)
  }

  const renderCollapsedState = () => {
    const label = MODE_LABELS[mode]
    const arrow = '< '
    const contentText = ` ${arrow}${label} `
    const contentWidth = stringWidth(contentText)
    const horizontal = '─'.repeat(contentWidth)

    const borderColor = isCollapsedHovered ? theme.foreground : theme.border

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          backgroundColor: 'transparent',
        }}
        onMouseDown={handleCollapsedClick}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
      >
        <text fg={borderColor}>{`╭${horizontal}╮`}</text>
        <text fg={theme.foreground}>
          <span fg={borderColor}>│</span>
          {isCollapsedHovered ? (
            <b>{` ${arrow}${label} `}</b>
          ) : (
            ` ${arrow}${label} `
          )}
          <span fg={borderColor}>│</span>
        </text>
        <text fg={borderColor}>{`╰${horizontal}╯`}</text>
      </box>
    )
  }

  if (!hoverToggle.isOpen) {
    return renderCollapsedState()
  }

  // Expanded state: delegate rendering to SegmentedControl
  const segments: Segment[] = buildExpandedSegments(mode)

  return (
    <SegmentedControl
      segments={segments}
      onSegmentClick={handleSegmentClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    />
  )
}
