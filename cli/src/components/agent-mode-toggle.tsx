import React, { useRef, useState } from 'react'
import stringWidth from 'string-width'
import { useTheme } from '../hooks/use-theme'

import type { AgentMode } from '../utils/constants'
import type { ChatTheme } from '../types/theme-system'

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

  const handlePress = (selectedMode: AgentMode) => {
    if (selectedMode === mode) {
      // Toggle collapsed/expanded when clicking current mode
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
    setIsOpen(true)
  }

  const handleMouseOut = () => {
    // Delay closing by 1 second
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
      closeTimeoutRef.current = null
    }, 1000)
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
  const orderedModes = [
    ...ALL_MODES.filter((m) => m !== mode),
    mode,
  ]

  // Calculate widths for each segment
  const segmentWidths = orderedModes.map((m) => {
    const label = config[m].label
    if (m === mode) {
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
    const isActive = modeItem === mode
    const width = segmentWidths[index]
    const content = isActive ? ` < ${label} ` : ` ${label} `
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
      {/* Left edge */}
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <text>
          <span fg={segments[0].frameColor}>╭</span>
        </text>
        <text>
          <span fg={segments[0].frameColor}>│</span>
        </text>
        <text>
          <span fg={segments[0].frameColor}>╰</span>
        </text>
      </box>

      {/* Segments as vertical columns */}
      {segments.map((seg, idx) => {
        const modeItem = orderedModes[idx]
        const isLast = idx === segments.length - 1
        return (
          <React.Fragment key={`segment-${idx}`}>
            <box
              onMouseDown={() => handlePress(modeItem)}
              style={{
                flexDirection: 'column',
                gap: 0,
                width: seg.width,
                minWidth: seg.width,
              }}
            >
              <text>
                <span fg={seg.frameColor}>{seg.topBorder}</span>
              </text>
              <text>
                {seg.isActive ? (
                  <>
                    <span fg={seg.textColor}> {'< '}</span>
                    <b>
                      <span fg={seg.textColor}>{seg.label}</span>
                    </b>
                    <span fg={seg.textColor}> </span>
                  </>
                ) : (
                  <span fg={seg.textColor}>{seg.content}</span>
                )}
              </text>
              <text>
                <span fg={seg.frameColor}>{seg.bottomBorder}</span>
              </text>
            </box>
            <box style={{ flexDirection: 'column', gap: 0 }}>
              <text>
                <span fg={seg.frameColor}>{isLast ? '╮' : '┬'}</span>
              </text>
              <text>
                <span fg={seg.frameColor}>│</span>
              </text>
              <text>
                <span fg={seg.frameColor}>{isLast ? '╯' : '┴'}</span>
              </text>
            </box>
          </React.Fragment>
        )
      })}
    </box>
  )
}
