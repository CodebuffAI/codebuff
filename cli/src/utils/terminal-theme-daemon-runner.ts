/**
 * Daemon runner - exports the daemon main function
 * This is called when the binary is spawned with --internal-daemon flag
 */

// Import the daemon main function
import { runDaemonMain } from './terminal-theme-daemon'

export async function runDaemon() {
  await runDaemonMain()
}
