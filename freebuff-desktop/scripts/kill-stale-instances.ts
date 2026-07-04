/**
 * Kill any previously-launched Freebuff Desktop instance before a fresh
 * `bun run app` / `bun run dev`.
 *
 * Why this is needed: electron/main.cjs holds a single-instance lock
 * (app.requestSingleInstanceLock). If an older instance is still running, a new
 * `electron .` fails the lock and quits immediately after just re-focusing the
 * OLD window — so `ui:build` rebuilds dist-ui but you keep seeing the old
 * renderer, still served by the old orchestrator running old `src/app` code.
 * Killing the previous instance first makes every launch load the latest code.
 *
 * Precision: we only kill processes whose *absolute* command line points at
 * THIS checkout — the orchestrator (`<pkg>/src/app/server.ts`) and this repo's
 * Electron (`<electron node_modules>/electron…`). A sibling worktree, or an
 * unrelated Electron app (Cursor, Discord, …), lives at a different path and is
 * never matched. Our own pid (and the `sh -c` running the app script, whose
 * argv holds only the literal `electron .`, not an absolute path) are excluded.
 *
 * POSIX-only (macOS/Linux), which is where `bun app`/`bun dev` run. On Windows
 * it is a best-effort no-op — the packaged app path doesn't use this.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'

const PKG_DIR = path.resolve(import.meta.dir, '..')

/** The node_modules dir that actually holds `electron` (hoisted to a workspace
 *  root under Bun). Walk up from the package dir until we find it. */
function findElectronModulesDir(start: string): string | null {
  let dir = start
  for (;;) {
    if (existsSync(path.join(dir, 'node_modules', 'electron'))) {
      return path.join(dir, 'node_modules')
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Kill every process from THIS checkout's desktop app (orchestrator + Electron).
 *  Best-effort and idempotent; never throws (a failed launch shouldn't be
 *  blocked by a kill that raced a process exiting). */
export async function killStaleInstances(): Promise<void> {
  if (process.platform === 'win32') return

  const nm = findElectronModulesDir(PKG_DIR)
  // Absolute-path signatures unique to this checkout. Substring match against
  // each process's full argv.
  const signatures = [
    path.join(PKG_DIR, 'src', 'app', 'server.ts'), // the Bun orchestrator
    ...(nm
      ? [
          path.join(nm, 'electron', 'dist'), // the running Electron.app (lock holder)
          path.join(nm, '.bin', 'electron'), // the `.bin/electron` launcher
        ]
      : []),
  ]

  let listing: string
  try {
    // -axww: every process, full (untruncated) argv.
    const proc = Bun.spawnSync(['ps', '-axww', '-o', 'pid=,command='])
    if (!proc.success) return
    listing = proc.stdout.toString()
  } catch {
    return
  }

  const self = process.pid
  const victims: number[] = []
  for (const line of listing.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/)
    if (!m) continue
    const pid = Number(m[1])
    if (pid === self) continue
    if (signatures.some((sig) => m[2].includes(sig))) victims.push(pid)
  }
  if (victims.length === 0) return

  const alive = (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  const signal = (pid: number, sig: NodeJS.Signals) => {
    try {
      process.kill(pid, sig)
    } catch {
      // already gone / not ours to signal
    }
  }

  victims.forEach((pid) => signal(pid, 'SIGTERM'))
  // Give Electron a moment to release its single-instance lock, then escalate
  // any stragglers so the new instance never loses the lock race.
  await Bun.sleep(800)
  victims.filter(alive).forEach((pid) => signal(pid, 'SIGKILL'))

  console.log(
    `[app] killed ${victims.length} stale Freebuff Desktop process(es): ${victims.join(', ')}`,
  )
}

if (import.meta.main) await killStaleInstances()
