/**
 * Shared process supervisor for the dev launchers (dev.ts, dev-web.ts). Spawns
 * children with inherited stdio and tears them ALL down when any one exits or the
 * launcher is signalled — so Ctrl-C never leaves an orphaned vite/electron/
 * orchestrator behind.
 */

import { spawn, type Subprocess } from 'bun'

/** Package root — `scripts/` lives directly under it, so children run from there. */
export const PKG = import.meta.dir + '/..'

const procs: Subprocess[] = []

export function run(name: string, cmd: string[], env: Record<string, string> = {}) {
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
