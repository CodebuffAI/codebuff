import { resetTerminalTitle } from './terminal-title'
import { stopActiveRun } from './active-run'
import { exitCliCleanly, registerExitCleanup } from './exit-cleanly'
import { flushLiveChatState } from './run-state-storage'
import { writeTerminalControlSync } from './terminal-io'
import { TERMINAL_RESET_SEQUENCES } from './terminal-reset-sequences'
import { stopTerminalWatchdog } from './terminal-watchdog'

import type { CliRenderer } from '@opentui/core'

let renderer: CliRenderer | null = null
let handlersInstalled = false
let cleanupStarted = false

/**
 * Reset terminal state by writing escape sequences to the controlling terminal.
 * This is called after renderer.destroy() so buffered renderer output cannot
 * land on the restored main screen after the reset.
 *
 * This is especially important on Windows where signals like SIGTERM and SIGHUP
 * don't work, so we rely on the 'exit' event which is guaranteed to run.
 */
function resetTerminalState(): boolean {
  try {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }
  } catch {
    // Ignore errors - stdin may already be closed
  }
  try {
    // Reset terminal title to default
    resetTerminalTitle()
    if (!process.stdout.isTTY) return true

    const resetCompletedSynchronously = writeTerminalControlSync(
      TERMINAL_RESET_SEQUENCES,
    )
    if (!resetCompletedSynchronously) {
      // Best-effort immediate reset. Keep the watchdog armed below so it can
      // retry after this process exits if the buffered write is lost.
      process.stdout.write(TERMINAL_RESET_SEQUENCES)
    }
    return resetCompletedSynchronously
  } catch {
    // Ignore errors - stdout may already be closed
    return false
  }
}

/**
 * Destroy OpenTUI before resetting the terminal. destroy() can finalize
 * synchronously or defer until an active frame finishes; in the deferred case,
 * schedule the reset after the destroy event's remaining synchronous work.
 */
function destroyRendererAndResetTerminal(): boolean {
  const activeRenderer = renderer
  renderer = null
  if (!activeRenderer || activeRenderer.isDestroyed) {
    return resetTerminalState()
  }

  let destroyReturned = false
  let destroyFinalized = false
  activeRenderer.once('destroy', () => {
    destroyFinalized = true
    if (destroyReturned) {
      queueMicrotask(resetTerminalState)
    }
  })

  try {
    activeRenderer.destroy()
    destroyReturned = true
    return destroyFinalized ? resetTerminalState() : false
  } catch {
    // A direct reset is still safe if renderer teardown itself failed.
    return resetTerminalState()
  }
}

/**
 * Clean up the renderer by calling destroy().
 * This resets terminal state to prevent garbled output after exit.
 */
function cleanup(): boolean {
  if (cleanupStarted) {
    // The process 'exit' handler deliberately reaches this branch to make the
    // terminal reset the final write, even if destroy was deferred above.
    return resetTerminalState()
  }
  cleanupStarted = true

  // Finalize the active message before reading the live provider. This makes
  // the synchronous flush include the interruption UI and prevents a late
  // SDK callback from continuing to own the chat while shutdown proceeds.
  try {
    stopActiveRun('process-exit')
  } catch {
    // Continue restoring the terminal even if run finalization fails.
  }

  // Persist any in-flight chat state first (synchronous, best-effort) so
  // closing the terminal or killing the process mid-run doesn't lose the turn.
  try {
    flushLiveChatState()
  } catch {
    // Persistence is best-effort during process teardown.
  }

  return destroyRendererAndResetTerminal()
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
  registerExitCleanup(cleanup)

  const handleSignal = () => {
    void exitCliCleanly()
  }

  // SIGTERM - Default kill signal (e.g., `kill <pid>`)
  process.on('SIGTERM', handleSignal)

  // SIGHUP - Terminal hangup (e.g., closing the terminal window)
  process.on('SIGHUP', handleSignal)

  // SIGINT - Ctrl+C
  process.on('SIGINT', handleSignal)

  // beforeExit - Called when the event loop is empty and about to exit
  process.on('beforeExit', () => {
    cleanup()
  })

  // exit - Last chance to run synchronous cleanup code
  process.on('exit', () => {
    // Only silence the external fallback after the final reset bytes were
    // synchronously accepted. If direct terminal access failed, leave it armed
    // to repair the terminal after this process disappears.
    if (cleanup()) {
      stopTerminalWatchdog()
    }
  })

  const handleFatalError = (label: string, error: unknown) => {
    cleanup() // Exit alt screen FIRST so error output is visible on the main screen
    try {
      console.error(`${label}:`, error)
    } catch {
      // Ignore logging errors
    }
    process.exit(1)
  }

  // uncaughtException - Safety net for unhandled errors
  process.on('uncaughtException', (error) => {
    handleFatalError('Uncaught exception', error)
  })

  // unhandledRejection - Safety net for unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    handleFatalError('Unhandled rejection', reason)
  })
}
