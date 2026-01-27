/**
 * SessionViewer - Interactive TUI for viewing tmux session data
 *
 * Designed to be simple and predictable for both humans and AIs:
 * - Humans: navigate captures with arrow keys / vim keys, or use replay mode
 * - AIs: typically use the --json flag on the CLI entrypoint instead of the TUI
 */

import { TextAttributes } from '@opentui/core'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'


import { getTheme } from './theme'

import type { SessionData, Capture } from '../types'
import type { ViewerTheme } from './theme'
import type { ScrollBoxRenderable } from '@opentui/core'

interface SessionViewerProps {
  data: SessionData
  onExit: () => void
  /**
   * Reserved for future use if we ever want a TUI hotkey to print JSON.
   * For now, AIs should call the CLI with --json instead.
   */
  onJsonOutput?: () => void
  /**
   * Start in replay mode (auto-playing through captures)
   */
  startInReplayMode?: boolean
}

// Available playback speeds (seconds per capture)
const PLAYBACK_SPEEDS = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0]
const DEFAULT_SPEED_INDEX = 2 // 1.5 seconds

export const SessionViewer: React.FC<SessionViewerProps> = ({
  data,
  onExit,
  startInReplayMode = false,
}) => {
  const theme = getTheme()
  const captures = data.captures

  const [selectedIndex, setSelectedIndex] = useState(() =>
    captures.length > 0 ? 0 : -1,
  )

  // Replay state
  const [isPlaying, setIsPlaying] = useState(startInReplayMode)
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX)
  const playbackSpeed = PLAYBACK_SPEEDS[speedIndex]
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-advance effect for replay mode
  useEffect(() => {
    if (!isPlaying || captures.length === 0) {
      return
    }

    timerRef.current = setTimeout(() => {
      setSelectedIndex((prev) => {
        const next = prev + 1
        if (next >= captures.length) {
          // Reached the end, stop playing
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, playbackSpeed * 1000)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isPlaying, selectedIndex, playbackSpeed, captures.length])

  // Replay control functions
  const togglePlay = useCallback(() => {
    if (captures.length === 0) return
    // If at end and pressing play, restart from beginning
    if (!isPlaying && selectedIndex >= captures.length - 1) {
      setSelectedIndex(0)
    }
    setIsPlaying((prev) => !prev)
  }, [captures.length, isPlaying, selectedIndex])

  const increaseSpeed = useCallback(() => {
    setSpeedIndex((prev) => Math.max(0, prev - 1)) // Lower index = faster
  }, [])

  const decreaseSpeed = useCallback(() => {
    setSpeedIndex((prev) => Math.min(PLAYBACK_SPEEDS.length - 1, prev + 1))
  }, [])

  // Keyboard input handling (q/Ctrl+C to quit, arrows + vim keys to navigate, space for play/pause)
  useEffect(() => {
    const handleKey = (key: string) => {
      // Quit: q or Ctrl+C
      if (key === 'q' || key === '\x03') {
        onExit()
        return
      }

      // Space: toggle play/pause
      if (key === ' ') {
        togglePlay()
        return
      }

      // +/= : increase speed (faster)
      if (key === '+' || key === '=') {
        increaseSpeed()
        return
      }

      // -/_ : decrease speed (slower)
      if (key === '-' || key === '_') {
        decreaseSpeed()
        return
      }

      // r: restart from beginning
      if (key === 'r') {
        setSelectedIndex(0)
        return
      }

      if (captures.length === 0) {
        return
      }

      // Stop playback on manual navigation
      const stopAndNavigate = () => {
        setIsPlaying(false)
      }

      // Left: arrow left or h => previous capture
      if (key === '\x1b[D' || key === 'h') {
        stopAndNavigate()
        setSelectedIndex((prev) => Math.max(0, prev - 1))
        return
      }

      // Right: arrow right or l => next capture
      if (key === '\x1b[C' || key === 'l') {
        stopAndNavigate()
        setSelectedIndex((prev) =>
          Math.min(captures.length - 1, Math.max(0, prev + 1)),
        )
      }
    }

    const stdin: NodeJS.ReadStream = process.stdin as any
    const onData = (chunk: Buffer) => {
      handleKey(chunk.toString())
    }

    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.on('data', onData)

    return () => {
      // Remove only this listener to avoid interfering with other handlers
      if (typeof (stdin as any).off === 'function') {
        ;(stdin as any).off('data', onData)
      } else {
        stdin.removeListener('data', onData as any)
      }
    }
  }, [captures.length, onExit, togglePlay, increaseSpeed, decreaseSpeed])

  const selectedCapture: Capture | undefined =
    selectedIndex >= 0 && selectedIndex < captures.length
      ? captures[selectedIndex]
      : undefined

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: theme.surface,
      }}
    >
      {/* Header */}
      <SessionHeader data={data} theme={theme} />

      {/* Main content area */}
      <box
        style={{
          flexDirection: 'column',
          flexGrow: 1,
          gap: 1,
          padding: 1,
        }}
      >
        <CapturePanel
          capture={selectedCapture}
          theme={theme}
        />

        <TimelinePanel
          captures={captures}
          selectedIndex={selectedIndex}
          isPlaying={isPlaying}
          theme={theme}
        />
      </box>

      {/* Footer / help text with replay controls */}
      <Footer
        theme={theme}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        currentIndex={selectedIndex}
        totalCaptures={captures.length}
      />
    </box>
  )
}

// Header component
const SessionHeader: React.FC<{ data: SessionData; theme: ViewerTheme }> = ({
  data,
  theme,
}) => {
  const { sessionInfo, commands, captures } = data

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text style={{ fg: theme.primary, attributes: TextAttributes.BOLD }}>
          Session: {sessionInfo.session}
        </text>
        <text style={{ fg: theme.muted }}>
          {sessionInfo.dimensions.width}x{sessionInfo.dimensions.height}
        </text>
      </box>
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text style={{ fg: theme.muted }}>{commands.length} cmds</text>
        <text style={{ fg: theme.muted }}>{captures.length} captures</text>
      </box>
    </box>
  )
}

// Timeline panel component (bottom) - card-style items with borders
const TIMELINE_CARD_WIDTH = 28

// Get actual terminal width, with fallback
function getTerminalWidth(): number {
  return process.stdout.columns || 120
}

const TimelinePanel: React.FC<{
  captures: Capture[]
  selectedIndex: number
  isPlaying: boolean
  theme: ViewerTheme
}> = ({ captures, selectedIndex, isPlaying, theme }) => {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  // Track terminal width for centering calculations
  const [terminalWidth, setTerminalWidth] = useState(getTerminalWidth)

  // Listen for terminal resize
  useEffect(() => {
    const handleResize = () => setTerminalWidth(getTerminalWidth())
    process.stdout.on('resize', handleResize)
    return () => {
      process.stdout.off('resize', handleResize)
    }
  }, [])

  // Calculate padding needed to allow centering at edges
  // Account for the timeline panel border (2 chars) and some margin
  const viewportWidth = terminalWidth - 4
  const centerPadding = Math.floor(viewportWidth / 2)

  // Auto-scroll to center the selected item
  useLayoutEffect(() => {
    if (scrollRef.current?.scrollTo && captures.length > 0) {
      // Each card takes TIMELINE_CARD_WIDTH + 1 (for gap)
      const cardTotalWidth = TIMELINE_CARD_WIDTH + 1
      // Position of the selected card's center (including left padding)
      const cardCenterPosition = centerPadding + (selectedIndex * cardTotalWidth) + (TIMELINE_CARD_WIDTH / 2)
      // Scroll so that the card center is in the middle of the viewport
      const scrollX = Math.max(0, cardCenterPosition - (viewportWidth / 2))
      scrollRef.current.scrollTo({ x: scrollX, y: 0 })
    }
  }, [selectedIndex, captures.length, centerPadding, viewportWidth])

  // Timeline title shows play/pause status
  const timelineTitle = isPlaying ? '▶ Playing' : '⏸ Paused'

  if (captures.length === 0) {
    return (
      <box
        title={timelineTitle}
        style={{
          flexDirection: 'column',
          height: 9,
          borderStyle: 'single',
          borderColor: theme.border,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        <text style={{ fg: theme.muted }}>No captures</text>
      </box>
    )
  }

  return (
    <box
      title={timelineTitle}
      style={{
        flexDirection: 'column',
        height: 9,
        borderStyle: 'single',
        borderColor: theme.border,
      }}
      border={['top', 'bottom', 'left', 'right']}
    >
      <scrollbox
        ref={scrollRef}
        scrollX={true}
        scrollY={false}
        scrollbarOptions={{ visible: false }}
        style={{
          flexGrow: 1,
          rootOptions: { backgroundColor: 'transparent' },
          wrapperOptions: { border: false, backgroundColor: 'transparent' },
          contentOptions: {
            flexDirection: 'row',
            backgroundColor: 'transparent',
            gap: 1,
            paddingLeft: centerPadding,
            paddingRight: centerPadding,
            paddingTop: 1,
            paddingBottom: 1,
          },
        }}
      >
        {captures.map((capture, idx) => {
          const isSelected = idx === selectedIndex
          const label =
            capture.frontMatter.label ||
            `Capture ${capture.frontMatter.sequence}`
          const time = formatTime(capture.frontMatter.timestamp)
          const seq = capture.frontMatter.sequence
          const afterCommand = capture.frontMatter.after_command

          return (
            <TimelineCard
              key={capture.path}
              isSelected={isSelected}
              seq={seq}
              time={time}
              label={label}
              afterCommand={afterCommand}
              theme={theme}
            />
          )
        })}
      </scrollbox>
    </box>
  )
}

// Individual timeline card component
const TimelineCard: React.FC<{
  isSelected: boolean
  seq: number
  time: string
  label: string
  afterCommand: string | null
  theme: ViewerTheme
}> = ({ isSelected, seq, time, label, afterCommand, theme }) => {
  const indicator = isSelected ? '▶' : '○'
  const titleText = `${indicator} [${seq}] ${time}`
  const truncatedLabel = label.slice(0, TIMELINE_CARD_WIDTH - 4)
  // Show a short command snippet if available
  const commandSnippet = afterCommand
    ? truncateCommand(afterCommand, TIMELINE_CARD_WIDTH - 6)
    : null

  return (
    <box
      title={titleText}
      style={{
        flexDirection: 'column',
        width: TIMELINE_CARD_WIDTH,
        height: 5,
        borderStyle: 'single',
        borderColor: isSelected ? theme.primary : theme.border,
        backgroundColor: isSelected ? theme.surfaceHover : 'transparent',
        justifyContent: 'center',
      }}
      border={['top', 'bottom', 'left', 'right']}
    >
      {/* Label inside the box */}
      <box style={{ paddingLeft: 1, paddingRight: 1 }}>
        <text
          style={{
            fg: isSelected ? theme.foreground : theme.muted,
            attributes: isSelected ? TextAttributes.BOLD : undefined,
          }}
        >
          {truncatedLabel}
        </text>
      </box>
      {/* Command snippet - always render to keep consistent height */}
      <box style={{ paddingLeft: 1, paddingRight: 1 }}>
        <text style={{ fg: theme.muted }}>
          {commandSnippet ? `$ ${commandSnippet}` : ' '}
        </text>
      </box>
    </box>
  )
}

// Capture panel component (top)
const CapturePanel: React.FC<{
  capture: Capture | undefined
  theme: ViewerTheme
}> = ({ capture, theme }) => {
  if (!capture) {
    return (
      <box
        style={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <text style={{ fg: theme.muted }}>No capture selected</text>
      </box>
    )
  }

  const { content } = capture

  return (
    <box
      style={{
        flexDirection: 'column',
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Muted box around the terminal capture */}
      <box
        style={{
          borderStyle: 'single',
          borderColor: theme.muted,
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        <text style={{ fg: theme.foreground }}>{content}</text>
      </box>
    </box>
  )
}

// Footer component with help text and replay controls
const Footer: React.FC<{
  theme: ViewerTheme
  isPlaying: boolean
  playbackSpeed: number
  currentIndex: number
  totalCaptures: number
}> = ({ theme, isPlaying, playbackSpeed, currentIndex, totalCaptures }) => {
  const position = totalCaptures > 0 ? `${currentIndex + 1}/${totalCaptures}` : '0/0'
  const speedDisplay = `${playbackSpeed.toFixed(1)}s`
  const playIcon = isPlaying ? '⏸' : '▶'

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
      }}
      border={['top']}
    >
      {/* Left: Replay status */}
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text style={{ fg: isPlaying ? theme.success : theme.muted }}>
          {playIcon}
        </text>
        <text style={{ fg: theme.foreground }}>{position}</text>
        <text style={{ fg: theme.muted }}>@{speedDisplay}</text>
      </box>

      {/* Center: Key hints */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <text style={{ fg: theme.muted }}>space: play/pause</text>
        <text style={{ fg: theme.muted }}>+/-: speed</text>
        <text style={{ fg: theme.muted }}>←→: navigate</text>
        <text style={{ fg: theme.muted }}>r: restart</text>
        <text style={{ fg: theme.muted }}>q: quit</text>
      </box>

      {/* Right: Mode indicator */}
      <box>
        <text style={{ fg: theme.muted }}>--json for AI</text>
      </box>
    </box>
  )
}

// Helper to format ISO timestamp into HH:MM:SS
function formatTime(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return isoTimestamp.slice(11, 19)
  }
}

// Helper to truncate command strings for display
function truncateCommand(command: string, maxLength: number): string {
  // Remove newlines and extra whitespace
  const cleaned = command.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= maxLength) {
    return cleaned
  }
  return cleaned.slice(0, maxLength - 1) + '…'
}
