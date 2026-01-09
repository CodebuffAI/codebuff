/**
 * SessionViewer - Interactive TUI for viewing tmux session data
 *
 * Designed to be simple and predictable for both humans and AIs:
 * - Humans: navigate captures with arrow keys / vim keys
 * - AIs: typically use the --json flag on the CLI entrypoint instead of the TUI
 */

import { TextAttributes } from '@opentui/core'
import React, { useEffect, useState } from 'react'

import { getTheme } from './theme'

import type { SessionData, Capture } from '../types'
import type { ViewerTheme } from './theme'

interface SessionViewerProps {
  data: SessionData
  onExit: () => void
  /**
   * Reserved for future use if we ever want a TUI hotkey to print JSON.
   * For now, AIs should call the CLI with --json instead.
   */
  onJsonOutput?: () => void
}

export const SessionViewer: React.FC<SessionViewerProps> = ({
  data,
  onExit,
}) => {
  const theme = getTheme()
  const captures = data.captures

  const [selectedIndex, setSelectedIndex] = useState(() =>
    captures.length > 0 ? 0 : -1,
  )
  const [focusedPanel, setFocusedPanel] = useState<'timeline' | 'capture'>(
    'timeline',
  )

  // Keyboard input handling (q/Ctrl+C to quit, arrows + vim keys to navigate)
  useEffect(() => {
    const handleKey = (key: string) => {
      // Quit: q or Ctrl+C
      if (key === 'q' || key === '\x03') {
        onExit()
        return
      }

      if (captures.length === 0) {
        return
      }

      // Up: arrow up or k
      if (key === '\x1b[A' || key === 'k') {
        setSelectedIndex((prev) => Math.max(0, prev - 1))
        return
      }

      // Down: arrow down or j
      if (key === '\x1b[B' || key === 'j') {
        setSelectedIndex((prev) =>
          Math.min(captures.length - 1, Math.max(0, prev + 1)),
        )
        return
      }

      // Right: arrow right or l => focus capture panel
      if (key === '\x1b[C' || key === 'l') {
        setFocusedPanel('capture')
        return
      }

      // Left: arrow left or h => focus timeline panel
      if (key === '\x1b[D' || key === 'h') {
        setFocusedPanel('timeline')
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
  }, [captures.length, onExit])

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
          flexDirection: 'row',
          flexGrow: 1,
          gap: 1,
          padding: 1,
        }}
      >
        <TimelinePanel
          captures={captures}
          selectedIndex={selectedIndex}
          focused={focusedPanel === 'timeline'}
          theme={theme}
        />

        <CapturePanel
          capture={selectedCapture}
          focused={focusedPanel === 'capture'}
          theme={theme}
        />
      </box>

      {/* Footer / help text */}
      <Footer theme={theme} />
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
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
      }}
      border={['bottom']}
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
        <StatusBadge status={sessionInfo.status} theme={theme} />
      </box>
    </box>
  )
}

// Status badge component
const StatusBadge: React.FC<{ status: string; theme: ViewerTheme }> = ({
  status,
  theme,
}) => {
  const color =
    status === 'active'
      ? theme.success
      : status === 'completed'
        ? theme.primary
        : theme.error

  const icon =
    status === 'active' ? '●' : status === 'completed' ? '✓' : '✗'

  return (
    <text style={{ fg: color }}>
      {icon} {status}
    </text>
  )
}

// Timeline panel component (left side)
const TimelinePanel: React.FC<{
  captures: Capture[]
  selectedIndex: number
  focused: boolean
  theme: ViewerTheme
}> = ({ captures, selectedIndex, focused, theme }) => {
  return (
    <box
      style={{
        flexDirection: 'column',
        width: 40,
        borderStyle: 'single',
        borderColor: focused ? theme.primary : theme.border,
      }}
      border={['top', 'bottom', 'left', 'right']}
    >
      <box
        style={{
          paddingLeft: 1,
          borderStyle: 'single',
          borderColor: theme.border,
        }}
        border={['bottom']}
      >
        <text
          style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}
        >
          Timeline
        </text>
      </box>

      <scrollbox
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        style={{
          flexGrow: 1,
          rootOptions: { backgroundColor: 'transparent' },
          wrapperOptions: { border: false, backgroundColor: 'transparent' },
          contentOptions: {
            flexDirection: 'column',
            backgroundColor: 'transparent',
          },
        }}
      >
        {captures.map((capture, idx) => {
          const isSelected = idx === selectedIndex
          const label =
            capture.frontMatter.label ||
            `Capture ${capture.frontMatter.sequence}`
          const time = formatTime(capture.frontMatter.timestamp)
          const afterCmd = capture.frontMatter.after_command

          return (
            <box
              key={capture.path}
              style={{
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor: isSelected
                  ? theme.surfaceHover
                  : 'transparent',
                flexDirection: 'column',
              }}
            >
              <box style={{ flexDirection: 'row', gap: 1 }}>
                <text style={{ fg: isSelected ? theme.primary : theme.muted }}>
                  {isSelected ? '▶' : ' '}
                </text>
                <text style={{ fg: theme.muted }}>
                  [{capture.frontMatter.sequence}]
                </text>
                <text style={{ fg: theme.muted }}>{time}</text>
                <text
                  style={{
                    fg: isSelected ? theme.foreground : theme.muted,
                  }}
                >
                  {label.slice(0, 20)}
                </text>
              </box>
              {afterCmd && afterCmd !== 'null' && (
                <box style={{ paddingLeft: 3 }}>
                  <text style={{ fg: theme.warning }}>
                    ← {String(afterCmd).slice(0, 40)}
                  </text>
                </box>
              )}
            </box>
          )
        })}
      </scrollbox>
    </box>
  )
}

// Capture panel component (right side)
const CapturePanel: React.FC<{
  capture: Capture | undefined
  focused: boolean
  theme: ViewerTheme
}> = ({ capture, focused, theme }) => {
  if (!capture) {
    return (
      <box
        style={{
          flexGrow: 1,
          borderStyle: 'single',
          borderColor: theme.border,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        border={['top', 'bottom', 'left', 'right']}
      >
        <text style={{ fg: theme.muted }}>No capture selected</text>
      </box>
    )
  }

  const { frontMatter, content } = capture
  const label = frontMatter.label || `Capture ${frontMatter.sequence}`

  return (
    <box
      style={{
        flexDirection: 'column',
        flexGrow: 1,
        borderStyle: 'single',
        borderColor: focused ? theme.primary : theme.border,
      }}
      border={['top', 'bottom', 'left', 'right']}
    >
      {/* Capture header */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingLeft: 1,
          paddingRight: 1,
          borderStyle: 'single',
          borderColor: theme.border,
        }}
        border={['bottom']}
      >
        <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
          {label}
        </text>
        <text style={{ fg: theme.muted }}>
          {frontMatter.dimensions.width}x{frontMatter.dimensions.height}
        </text>
      </box>

      {/* Capture content */}
      <scrollbox
        scrollX={true}
        scrollbarOptions={{ visible: false }}
        style={{
          flexGrow: 1,
          rootOptions: { backgroundColor: 'transparent' },
          wrapperOptions: { border: false, backgroundColor: 'transparent' },
          contentOptions: { backgroundColor: 'transparent' },
        }}
      >
        <text style={{ fg: theme.foreground }}>{content}</text>
      </scrollbox>
    </box>
  )
}

// Footer component with help text
const Footer: React.FC<{ theme: ViewerTheme }> = ({ theme }) => {
  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        borderStyle: 'single',
        borderColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
        gap: 2,
      }}
      border={['top']}
    >
      <text style={{ fg: theme.muted }}>↑↓ / jk navigate</text>
      <text style={{ fg: theme.muted }}>←→ / hl panels</text>
      <text style={{ fg: theme.muted }}>q or Ctrl+C: quit</text>
      <text style={{ fg: theme.muted }}>use --json for JSON output</text>
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
