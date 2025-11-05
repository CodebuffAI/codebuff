import React, { useState } from 'react'
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

  if (!isOpen) {
    // Collapsed state: show only current mode
    const { frameColor, textColor, label } = config[mode]
    const arrow = ' <'
    const contentText = ` ${label}${arrow} `
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
      >
        <text>
          <span fg={frameColor}>{`╭${horizontal}╮`}</span>
        </text>
        <text>
          <span fg={frameColor}>│</span>
          <span fg={textColor}>{contentText}</span>
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
      return stringWidth(` ${label} > `)
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
    const content = isActive ? ` ${label} > ` : ` ${label} `
    const horizontal = '─'.repeat(width)

    return {
      topBorder: isLast ? `${horizontal}╮` : `${horizontal}┬`,
      content,
      bottomBorder: isLast ? `${horizontal}╯` : `${horizontal}┴`,
      frameColor,
      textColor,
    }
  }

  const segments = orderedModes.map((m, idx) =>
    buildSegment(m, idx, idx === orderedModes.length - 1),
  )

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        backgroundColor: 'transparent',
      }}
    >
      {/* Top border */}
      <text>
        <span fg={segments[0].frameColor}>╭</span>
        {segments.map((seg, idx) => (
          <span key={`top-${idx}`} fg={seg.frameColor}>
            {seg.topBorder}
          </span>
        ))}
      </text>

      {/* Content row with clickable segments */}
      <box
        style={{
          flexDirection: 'row',
          gap: 0,
        }}
      >
        <text>
          <span fg={segments[0].frameColor}>│</span>
        </text>
        {segments.map((seg, idx) => {
          const modeItem = orderedModes[idx]
          return (
            <React.Fragment key={`content-${idx}`}>
              <box onMouseDown={() => handlePress(modeItem)}>
                <text>
                  <span fg={seg.textColor}>{seg.content}</span>
                </text>
              </box>
              <text>
                <span fg={seg.frameColor}>│</span>
              </text>
            </React.Fragment>
          )
        })}
      </box>

      {/* Bottom border */}
      <text>
        <span fg={segments[0].frameColor}>╰</span>
        {segments.map((seg, idx) => (
          <span key={`bottom-${idx}`} fg={seg.frameColor}>
            {seg.bottomBorder}
          </span>
        ))}
      </text>
    </box>
  )
}
