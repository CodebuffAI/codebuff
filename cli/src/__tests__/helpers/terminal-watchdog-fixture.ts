/**
 * Fixture process for terminal-watchdog.test.ts.
 *
 * Usage: bun terminal-watchdog-fixture.ts <mode> <ttyPath>
 * - mode "hang":  start the watchdog and stay alive until killed by the test.
 * - mode "clean": start the watchdog, then stop it and exit (clean shutdown).
 *
 * Prints "ready" once the watchdog is armed so the test knows when to kill.
 */
import {
  startTerminalWatchdog,
  stopTerminalWatchdog,
} from '../../utils/terminal-watchdog'

const [mode, ttyPath] = process.argv.slice(2)

if (!mode || !ttyPath) {
  console.error('usage: terminal-watchdog-fixture.ts <hang|clean> <ttyPath>')
  process.exit(2)
}

startTerminalWatchdog({ ttyPath })

if (mode === 'clean') {
  stopTerminalWatchdog()
  console.log('ready')
  process.exit(0)
}

console.log('ready')
setInterval(() => {}, 1_000)
