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
// Give Vite a moment to bind 5174 before Electron loads it.
await Bun.sleep(1200)
run('electron', ['bunx', 'electron', '.'], { FREEBUFF_DEV_UI: '1' })
