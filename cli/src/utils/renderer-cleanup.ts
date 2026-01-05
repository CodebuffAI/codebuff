import type { CliRenderer } from '@opentui/core'

let renderer: CliRenderer | null = null
let handlersInstalled = false

/**
 * Clean up the renderer by calling destroy().
 * This resets terminal state to prevent garbled output after exit.
 */
function cleanup(): void {
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
