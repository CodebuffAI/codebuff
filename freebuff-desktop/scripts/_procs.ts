/**
 * Shared process supervisor for the dev launchers (dev.ts, dev-web.ts). Spawns
 * children with inherited stdio and tears them ALL down when any one exits or the
 * launcher is signalled — so Ctrl-C never leaves an orphaned vite/electron/
 * orchestrator behind.
 */

import { spawn, spawnSync, type Subprocess } from 'bun'

/** Package root — `scripts/` lives directly under it, so children run from there. */
export const PKG = import.meta.dir + '/..'

const procs: Subprocess[] = []

/**
 * Collect a pid and all its descendants, deepest first. We spawn children through
 * wrappers (`bunx vite`, `bunx electron`), so the process we hold a handle to is
 * the `bunx` shim — its grandchild (the real node-vite / electron) is what binds
 * 5174/8787. Killing only the handle orphans that grandchild, which then squats
 * the port and ECONNREFUSEs the next `bun run dev`. So we tear down the tree.
 */
function tree(pid: number): number[] {
  const out = spawnSync(['pgrep', '-P', String(pid)]).stdout.toString().trim()
  const kids = out ? out.split('\n').map(Number) : []
  return [...kids.flatMap(tree), pid]
}

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
  for (const p of procs) {
    if (!p.pid) continue
    for (const pid of tree(p.pid)) {
      try {
        process.kill(pid)
      } catch {
        /* already gone */
      }
    }
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
