#!/usr/bin/env node

/**
 * Entry point for the CLI binary
 * Checks --internal-daemon flag and routes to either daemon or main app
 */

// Check if running in daemon mode (self-spawned for terminal theme polling)
if (process.argv.includes('--internal-daemon')) {
  // Import and run daemon
  import('./utils/terminal-theme-daemon-runner').then(async (mod) => {
    try {
      await mod.runDaemon()
      // Daemon runs indefinitely, but if it exits:
      process.exit(0)
    } catch (err) {
      console.error('Daemon error:', err)
      process.exit(1)
    }
  })
} else {
  // Normal app mode - import and run main app
  import('./index')
}
