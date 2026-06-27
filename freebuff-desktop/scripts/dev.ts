/**
 * Dev launcher: starts the Vite dev server (renderer, port 5174) and the Electron
 * shell in FREEBUFF_DEV_UI mode. Electron itself spawns the Bun orchestrator on
 * PORT=8787, which Vite proxies /api + /preview to.
 *
 *   bun run dev
 */

import { spawn, type Subprocess } from 'bun'

const procs: Subprocess[] = []
const PKG = import.meta.dir + '/..'

function run(name: string, cmd: string[], env: Record<string, string> = {}) {
  const p = spawn(cmd, {
    cwd: PKG,
    env: { ...process.env, ...env },
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })
  procs.push(p)
  p.exited.then((code) => {
    console.log(`[${name}] exited (${code})`)
    shutdown()
  })
  return p
}

function shutdown() {
  for (const p of procs) p.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

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
