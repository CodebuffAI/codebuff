import { useEffect } from 'react'

import { logger } from '../utils/logger'

import type { ReadStream } from 'tty'

/**
 * XTerm focus reporting escape sequences
 * https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 */
const ENABLE_FOCUS_REPORTING = '\x1b[?1004h'
const DISABLE_FOCUS_REPORTING = '\x1b[?1004l'
const FOCUS_IN_EVENT = '\x1b[I'
const FOCUS_OUT_EVENT = '\x1b[O'

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

    // Enable focus reporting
    enableFocusReporting()

    // Listen for data events on stdin to catch focus in/out sequences
    const handleData = (chunk: Buffer | string) => {
      const data = chunk.toString()

      // Use includes() instead of strict equality to handle cases where
      // terminal batches multiple sequences or keystrokes together
      if (data.includes(FOCUS_IN_EVENT)) {
        // First focus event confirms terminal support
        if (!supportDetected) {
          supportDetected = true
          onSupportDetected?.()
        }
        onFocusChange(true)
      } else if (data.includes(FOCUS_OUT_EVENT)) {
        // First focus event confirms terminal support
        if (!supportDetected) {
          supportDetected = true
          onSupportDetected?.()
        }
        onFocusChange(false)
      }
    }

    stdin.on('data', handleData)

    // Cleanup: disable focus reporting and remove listener
    return () => {
      stdin.off('data', handleData)
      disableFocusReporting()
    }
  }, [onFocusChange, onSupportDetected])
}
