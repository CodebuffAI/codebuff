import { TextAttributes } from '@opentui/core'
import React, { useRef, useState } from 'react'
import stringWidth from 'string-width'

import { useTheme } from '../hooks/use-theme'

import type { ChatTheme } from '../types/theme-system'
import type { AgentMode } from '../utils/constants'

const getModeConfig = (theme: ChatTheme) =>
  ({
    FAST: {
      frameColor: theme.modeFastBg,
      textColor: theme.modeFastText,
      label: 'FAST',
    },
    MAX: {
      frameColor: theme.modeMaxBg,
      textColor: theme.modeMaxText,
      label: 'MAX',
    },
    PLAN: {
      frameColor: theme.modePlanBg,
      textColor: theme.modePlanText,
      label: 'PLAN',
    },
  }) as const

const ALL_MODES: AgentMode[] = ['FAST', 'MAX', 'PLAN']

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
  const config = getModeConfig(theme)
  const [isOpen, setIsOpen] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const openTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number>(ALL_MODES.length)

  const handlePress = (selectedMode: AgentMode) => {
    // Cancel any pending open timeout - click should be immediate
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current)
      openTimeoutRef.current = null
    }

    if (selectedMode === mode) {
      // Toggle collapsed/expanded when clicking current mode (immediate)
      setIsOpen(!isOpen)
    } else {
      // Switch to different mode and close the toggle
      if (onSelectMode) {
        onSelectMode(selectedMode)
      } else {
        onToggle()
      }
      setIsOpen(false)
    }
  }

  const handleMouseOver = () => {
    // Cancel any pending close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    // If already open, do nothing
    if (isOpen) return

    setIsOpen(true)
    openTimeoutRef.current = null
  }

  const handleMouseOut = () => {
    // Cancel any pending open
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current)
      openTimeoutRef.current = null
    }

    // Delay closing by 0.1 seconds
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
      closeTimeoutRef.current = null
      setHoveredIndex(ALL_MODES.length)
    }, 100)
  }

  if (!isOpen) {
    // Collapsed state: show only current mode
    const { frameColor, textColor, label } = config[mode]
    const arrow = '< '
    const contentText = ` ${arrow}${label} `
    const contentWidth = stringWidth(contentText)
    const horizontal = '─'.repeat(contentWidth)

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          backgroundColor: 'transparent',
        }}
        onMouseDown={() => handlePress(mode)}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
      >
        <text>
          <span fg={frameColor}>{`╭${horizontal}╮`}</span>
        </text>
        <text>
          <span fg={frameColor}>│</span>
          <span fg={textColor}> {arrow}</span>
          <b>
            <span fg={textColor}>{label}</span>
          </b>
          <span fg={textColor}> </span>
          <span fg={frameColor}>│</span>
        </text>
        <text>
          <span fg={frameColor}>{`╰${horizontal}╯`}</span>
        </text>
      </box>
    )
  }

  // Expanded state: show all modes with current mode rightmost
  const orderedModes = [...ALL_MODES, mode]

  // Calculate widths for each segment
  const segmentWidths = orderedModes.map((m, i) => {
    const label = config[m].label
    if (i === orderedModes.length - 1) {
      // Active mode shows label with collapse arrow
      return stringWidth(` < ${label} `)
    }
    return stringWidth(` ${label} `)
  })

  const buildSegment = (
    modeItem: AgentMode,
    index: number,
    isLast: boolean,
  ) => {
    const { frameColor, textColor, label } = config[modeItem]
    const isActive = isLast
    const width = segmentWidths[index]
    const content = isLast ? ` < ${label} ` : ` ${label} `
    const horizontal = '─'.repeat(width)

    return {
      topBorder: horizontal,
      content,
      bottomBorder: horizontal,
      frameColor,
      textColor,
      isActive,
      label,
      width,
    }
  }

  const segments = orderedModes.map((m, idx) =>
    buildSegment(m, idx, idx === orderedModes.length - 1),
  )

  return (
    <box
      style={{
        flexDirection: 'row',
        gap: 0,
        backgroundColor: 'transparent',
      }}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      {/* Segments as vertical columns */}
      {segments.map((seg, idx) => {
        const modeItem = orderedModes[idx]
        const leftOfHovered = idx <= hoveredIndex
        const rightOfHovered = idx >= hoveredIndex

        return (
          <React.Fragment key={`segment-${idx}`}>
            <box
              onMouseDown={() => handlePress(modeItem)}
              onMouseOver={() => setHoveredIndex(idx)}
              style={{
                flexDirection: 'row',
                gap: 0,
              }}
            >
              {
                /* Left edge */
                leftOfHovered ? (
                  <box style={{ flexDirection: 'column', gap: 0, maxWidth: 1 }}>
                    <text fg={seg.frameColor}>╭│╰</text>
                  </box>
                ) : null
              }
              {
                /* Segments as vertical columns for sorting */
                <box>
                  <text>
                    <span fg={seg.frameColor}>{seg.topBorder}</span>
                  </text>
                  <text
                    attributes={
                      idx === hoveredIndex ? TextAttributes.BOLD : undefined
                    }
                    fg={seg.textColor}
                  >
                    {seg.isActive ? ` < ${seg.label} ` : seg.content}
                  </text>
                  <text>
                    <span fg={seg.frameColor}>{seg.bottomBorder}</span>
                  </text>
                </box>
              }
              {
                /* Right edge */
                rightOfHovered ? (
                  <box style={{ flexDirection: 'column', gap: 0, maxWidth: 1 }}>
                    <text fg={seg.frameColor}>╮│╯</text>
                  </box>
                ) : null
              }
            </box>
          </React.Fragment>
        )
      })}
    </box>
  )
}
