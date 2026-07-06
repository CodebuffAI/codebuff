/**
 * Fixture process for terminal-watchdog.test.ts.
 *
 * Usage: bun terminal-watchdog-fixture.ts <mode> <ttyPath>
 * - mode "hang":  start the watchdog and stay alive until killed by the test.
 * - mode "clean": start the watchdog, then stop it and exit (clean shutdown).
 *
 * Prints "ready" once the watchdog is armed so the test knows when to kill.
 * On Windows, arming is asynchronous (a PowerShell bootstrap has to launch
 * the real watchdog outside Bun's kill-on-close job object), so we wait for
 * the `<ttyPath>.armed` marker before printing "ready" — killing earlier
 * would take the bootstrap down before the watchdog exists.
 */
import { existsSync } from 'fs'

import {
  startTerminalWatchdog,
  stopTerminalWatchdog,
} from '../../utils/terminal-watchdog'

const [mode, ttyPath] = process.argv.slice(2)

if (!mode || !ttyPath) {
  console.error('usage: terminal-watchdog-fixture.ts <hang|clean> <ttyPath>')
  process.exit(2)
}

async function waitForArmed(): Promise<void> {
  if (process.platform !== 'win32') return
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (existsSync(`${ttyPath}.armed`)) return
    await new Promise((r) => setTimeout(r, 50))
  }
  console.error('watchdog never armed')
  process.exit(3)
}

startTerminalWatchdog({ ttyPath })

if (mode === 'clean') {
  await waitForArmed()
  stopTerminalWatchdog()
  console.log('ready')
  process.exit(0)
}

await waitForArmed()
console.log('ready')
setInterval(() => {}, 1_000)
