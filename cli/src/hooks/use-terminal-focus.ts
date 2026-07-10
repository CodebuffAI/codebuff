import { useEffect } from 'react'

import { logger } from '../utils/logger'

import type { ReadStream } from 'tty'

/**
 * XTerm focus reporting escape sequences
 * https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 */
const ENABLE_FOCUS_REPORTING = '\x1b[?1004h'
const DISABLE_FOCUS_REPORTING = '\x1b[?1004l'

// Focus in/out are complete CSI sequences: CSI I (ESC [ I) = focus gained,
// CSI O (ESC [ O) = focus lost. Match the full sequence rather than doing a
// naive substring test so unrelated bytes in the same chunk can't be mistaken
// for a focus event. The global flag lets us scan every occurrence in a chunk.
const FOCUS_EVENT_RE = /\x1b\[(I|O)/g

/**
 * Return the net focus state implied by a stdin chunk, or null if the chunk
 * contains no focus events. When a terminal batches several sequences into one
 * chunk (e.g. an alt-tab round trip, or focus events interleaved with a paste),
 * the LAST focus event is the current truth — so a focus-out followed by a
 * focus-in nets to "focused" and can't leave the UI wrongly dimmed.
 *
 * Exported for testing.
 */
export function parseFocusState(data: string): boolean | null {
  // Fast path: a chunk with no CSI introducer can't hold a focus event. This
  // runs on every keystroke, so keep it cheap.
  if (!data.includes('\x1b[')) {
    return null
  }
  let focused: boolean | null = null
  FOCUS_EVENT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FOCUS_EVENT_RE.exec(data)) !== null) {
    focused = match[1] === 'I'
  }
  return focused
}

function getStdin(): ReadStream | null {
  const stdin = process.stdin as ReadStream | undefined
  if (!stdin || !stdin.isTTY) {
    return null
  }
  return stdin
}

function enableFocusReporting(): void {
  const stdin = getStdin()
  if (!stdin) return

  try {
    process.stdout.write(ENABLE_FOCUS_REPORTING)
  } catch (error) {
    logger.debug(error, 'Failed to enable focus reporting')
  }
}

function disableFocusReporting(): void {
  const stdin = getStdin()
  if (!stdin) return

  try {
    process.stdout.write(DISABLE_FOCUS_REPORTING)
  } catch (error) {
    logger.debug(error, 'Failed to disable focus reporting')
  }
}

export interface UseTerminalFocusOptions {
  onFocusChange: (focused: boolean) => void
  onSupportDetected?: () => void
}

/**
 * Hook that enables XTerm focus reporting and calls onFocusChange when
 * the terminal window gains or loses focus.
 *
 * This uses the XTerm focus reporting feature (CSI ? 1004 h) which is
 * supported by most modern terminal emulators including:
 * - xterm
 * - iTerm2
 * - Alacritty
 * - Kitty
 * - GNOME Terminal
 * - Windows Terminal
 * - tmux (with focus-events enabled)
 *
 * When enabled, the terminal sends:
 * - \x1b[I on focus gained
 * - \x1b[O on focus lost
 */
export function useTerminalFocus({
  onFocusChange,
  onSupportDetected,
}: UseTerminalFocusOptions): void {
  useEffect(() => {
    const stdin = getStdin()
    if (!stdin) {
      return
    }

    let supportDetected = false
    // Track the last state we reported so a stream of identical events (some
    // terminals repeat focus reports) doesn't churn store state / re-renders.
    let lastReported: boolean | null = null

    // Enable focus reporting
    enableFocusReporting()

    // Listen for data events on stdin to catch focus in/out sequences. This
    // runs alongside OpenTUI's own stdin parser, so it must be conservative:
    // only act on genuine focus sequences and never on ordinary keystrokes.
    const handleData = (chunk: Buffer | string) => {
      const focused = parseFocusState(chunk.toString())
      if (focused === null) {
        return
      }

      // The first focus event of any kind confirms the terminal supports
      // focus reporting (enables cursor blink, etc.).
      if (!supportDetected) {
        supportDetected = true
        onSupportDetected?.()
      }

      if (focused === lastReported) {
        return
      }
      lastReported = focused
      onFocusChange(focused)
    }

    stdin.on('data', handleData)

    // Cleanup: disable focus reporting and remove listener
    return () => {
      stdin.off('data', handleData)
      disableFocusReporting()
    }
  }, [onFocusChange, onSupportDetected])
}
