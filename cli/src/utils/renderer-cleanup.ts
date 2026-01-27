import { resetTerminalTitle } from './terminal-title'

import type { CliRenderer } from '@opentui/core'


let renderer: CliRenderer | null = null
let handlersInstalled = false
let terminalStateReset = false

/**
 * Terminal escape sequences to reset terminal state.
 * These are written directly to stdout to ensure they're sent even if the renderer is in a bad state.
 *
 * Sequences:
 * - \x1b[?1000l: Disable X10 mouse mode
 * - \x1b[?1002l: Disable button event mouse mode
 * - \x1b[?1003l: Disable any-event mouse mode (all motion tracking)
 * - \x1b[?1006l: Disable SGR extended mouse mode
 * - \x1b[?1004l: Disable focus reporting
 * - \x1b[?2004l: Disable bracketed paste mode
 * - \x1b[?25h: Show cursor (safety measure)
 */
const TERMINAL_RESET_SEQUENCES =
  '\x1b[?1000l' + // Disable X10 mouse mode
  '\x1b[?1002l' + // Disable button event mouse mode
  '\x1b[?1003l' + // Disable any-event mouse mode (all motion)
  '\x1b[?1006l' + // Disable SGR extended mouse mode
  '\x1b[?1004l' + // Disable focus reporting
  '\x1b[?2004l' + // Disable bracketed paste mode
  '\x1b[?25h' // Show cursor

/**
 * Reset terminal state by writing escape sequences directly to stdout.
 * This is called BEFORE renderer.destroy() to ensure sequences are sent
 * even if the renderer is in a bad state.
 *
 * This is especially important on Windows where signals like SIGTERM and SIGHUP
 * don't work, so we rely on the 'exit' event which is guaranteed to run.
 */
function resetTerminalState(): void {
  if (terminalStateReset) return
  terminalStateReset = true

  try {
    // Reset terminal title to default
    resetTerminalTitle()
    // Write directly to stdout - this is synchronous and will complete
    // before the process exits, ensuring the terminal is reset
    process.stdout.write(TERMINAL_RESET_SEQUENCES)
  } catch {
    // Ignore errors - stdout may already be closed
  }
}

/**
 * Clean up the renderer by calling destroy().
 * This resets terminal state to prevent garbled output after exit.
 */
function cleanup(): void {
  // FIRST: Reset terminal state by writing escape sequences directly to stdout.
  // This ensures mouse mode, focus reporting, etc. are disabled even if
  // renderer.destroy() fails or doesn't fully clean up.
  resetTerminalState()

  if (renderer && !renderer.isDestroyed) {
    try {
      renderer.destroy()
    } catch {
      // Ignore errors during cleanup - we're exiting anyway
    }
    renderer = null
  }
}

/**
 * Install process-level signal handlers to ensure terminal cleanup on all exit scenarios.
 * Call this once after creating the renderer in index.tsx.
 *
 * This handles:
 * - SIGTERM (kill)
 * - SIGHUP (terminal hangup)
 * - SIGINT (Ctrl+C)
 * - beforeExit / exit events
 * - uncaughtException / unhandledRejection
 *
 * Note: SIGKILL cannot be caught - it's an immediate termination signal.
 */
export function installProcessCleanupHandlers(cliRenderer: CliRenderer): void {
  if (handlersInstalled) return
  handlersInstalled = true
  renderer = cliRenderer

  const cleanupAndExit = (exitCode: number) => {
    cleanup()
    process.exit(exitCode)
  }

  // SIGTERM - Default kill signal (e.g., `kill <pid>`)
  process.on('SIGTERM', () => {
    cleanupAndExit(0)
  })

  // SIGHUP - Terminal hangup (e.g., closing the terminal window)
  process.on('SIGHUP', () => {
    cleanupAndExit(0)
  })

  // SIGINT - Ctrl+C
  process.on('SIGINT', () => {
    cleanupAndExit(0)
  })

  // beforeExit - Called when the event loop is empty and about to exit
  process.on('beforeExit', () => {
    cleanup()
  })

  // exit - Last chance to run synchronous cleanup code
  process.on('exit', () => {
    cleanup()
  })

  // uncaughtException - Safety net for unhandled errors
  process.on('uncaughtException', (error) => {
    try {
      console.error('Uncaught exception:', error)
    } catch {
      // Ignore logging errors
    }
    cleanupAndExit(1)
  })

  // unhandledRejection - Safety net for unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    try {
      console.error('Unhandled rejection:', reason)
    } catch {
      // Ignore logging errors
    }
    cleanupAndExit(1)
  })
}
