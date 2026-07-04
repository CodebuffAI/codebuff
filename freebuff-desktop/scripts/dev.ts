/**
 * Dev launcher: starts the Vite dev server (renderer, port 5174) and the Electron
 * shell in FREEBUFF_DEV_UI mode. Electron itself spawns the Bun orchestrator on
 * PORT=8787, which Vite proxies /api + /preview to.
 *
 *   bun run dev
 */

import { brandDevElectron } from './brand-dev-electron'
import { killStaleInstances } from './kill-stale-instances'
import { run } from './_procs'

// Kill a previous instance first: Electron's single-instance lock would
// otherwise make a rerun re-focus the old window (old renderer + orchestrator)
// instead of loading the latest code.
await killStaleInstances()

// Make the dev Electron bundle show "Freebuff" + our icon in the Dock/Cmd+Tab
// (macOS-only, idempotent, best-effort — never blocks launch).
brandDevElectron()

run('vite', ['bunx', 'vite'])

// Wait until Vite is actually serving on 5174 before launching Electron. A fixed
// sleep races on cold starts (bunx resolve + first compile) → Electron loads
// before the port is bound and dies with ERR_CONNECTION_REFUSED.
async function waitForVite(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) })
      return
    } catch {
      await Bun.sleep(150)
    }
  }
  throw new Error(`Vite did not come up at ${url} within ${timeoutMs}ms`)
}

await waitForVite('http://127.0.0.1:5174/')
run('electron', ['bunx', 'electron', '.'], { FREEBUFF_DEV_UI: '1' })
