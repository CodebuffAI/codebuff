/**
 * Fixture process for terminal-watchdog.test.ts.
 *
 * Usage: bun terminal-watchdog-fixture.ts <mode> <ttyPath>
 * - mode "hang":  start the watchdog and stay alive until killed by the test.
 * - mode "clean": start the watchdog, then stop it and exit (clean shutdown).
 * - mode "spawn-failure": report a watchdog startup failure and exit.
 *
 * Prints "ready" once the watchdog is armed. On Windows, arming is asynchronous
 * (a PowerShell bootstrap has to launch the real watchdog outside Bun's
 * kill-on-close job object), so we wait for the `<ttyPath>.armed` marker before
 * printing "ready" — killing earlier would take the bootstrap down before the
 * watchdog exists.
 */
import { existsSync, writeFileSync } from 'fs'

import {
  getTerminalWatchdogDiagnostics,
  startTerminalWatchdog,
  stopTerminalWatchdog,
} from '../../utils/terminal-watchdog'

const [mode, ttyPath] = process.argv.slice(2)

if (!mode || !ttyPath) {
  console.error(
    'usage: terminal-watchdog-fixture.ts <hang|clean|spawn-failure> <ttyPath>',
  )
  process.exit(2)
}

async function waitForArmed(): Promise<void> {
  if (process.platform !== 'win32') return
  // An explicit opt-out is the one path where no armed marker is expected.
  if (!getTerminalWatchdogDiagnostics().armed) return
  // Deliberately shorter than the test's own ready budget, so a runner too slow
  // to boot PowerShell fails here — with a message — instead of surfacing later
  // as an unexplained empty write. Sized for several fixtures arming at once.
  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    if (existsSync(`${ttyPath}.armed`)) return
    await new Promise((r) => setTimeout(r, 50))
  }
  console.error(`watchdog never armed within 40s (marker: ${ttyPath}.armed)`)
  process.exit(3)
}

if (mode === 'spawn-failure') {
  const failure = await new Promise<unknown>((resolve) => {
    startTerminalWatchdog({
      ttyPath,
      reportFailure: resolve,
      windowsPowerShellPath: `${ttyPath}.missing.exe`,
    })
    setTimeout(() => {
      console.error('watchdog failure was not reported')
      process.exit(4)
    }, 10_000)
  })
  writeFileSync(ttyPath, JSON.stringify(failure))
  process.exit(0)
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
