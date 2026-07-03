/**
 * Sacrificial watchdog process that resets the terminal if the CLI dies
 * without running its own cleanup (SIGKILL, native crash, group kill).
 *
 * The in-process handlers (renderer-cleanup.ts) cover catchable exits, and
 * the npm wrapper resets when it outlives the binary — but neither survives
 * `pkill -9 node`-style sweeps that take out the wrapper and binary together,
 * and dev/direct-binary runs have no wrapper at all. This covers those:
 *
 * - We spawn a detached `/bin/sh` whose stdin is a pipe from this process.
 *   `sh` isn't named node/bun/codebuff/freebuff, so process-name kill sweeps
 *   miss it, and `detached` puts it in its own session so process-group kills
 *   miss it too.
 * - The watchdog blocks on `cat` until the pipe hits EOF — which only happens
 *   when this process is gone, however it died — then writes the reset
 *   sequences to its stdout, which is a dup of our stdout (the terminal).
 *   It must NOT open /dev/tty: being in its own session it has no controlling
 *   terminal, so that open fails with ENXIO. Writing to an inherited tty fd
 *   needs no controlling terminal.
 * - On clean shutdown we SIGKILL the watchdog first (process.kill is
 *   synchronous), so it never fires and the normal cleanup path owns the
 *   terminal writes.
 *
 * Windows has no /dev/tty or sh; there the npm wrapper remains the only
 * safety net for uncatchable exits.
 */
import { spawn } from 'child_process'
import { closeSync, openSync } from 'fs'

import { TERMINAL_RESET_SEQUENCES } from './terminal-reset-sequences'

import type { ChildProcess } from 'child_process'

let watchdog: ChildProcess | null = null

/** Reset payload with ESC as printf-compatible octal escapes. */
function printfPayload(): string {
  return TERMINAL_RESET_SEQUENCES.replace(/\x1b/g, '\\033')
}

/**
 * Start the watchdog. Call once, before the TUI renderer starts enabling
 * terminal modes. No-op on Windows, when stdout isn't a TTY (unless an
 * explicit ttyPath is injected, e.g. in tests), or if already started.
 *
 * @param options.ttyPath - Override the reset target (the watchdog's stdout
 *   is pointed at this file instead of inheriting ours). Tests inject a
 *   regular file here to observe what gets written.
 */
export function startTerminalWatchdog(options?: { ttyPath?: string }): void {
  if (watchdog) return
  if (process.platform === 'win32') return
  if (!options?.ttyPath && !process.stdout.isTTY) return

  // `cat` holds until our death closes the pipe; the reset then goes to the
  // watchdog's stdout (see stdio below). The payload contains no quotes, so
  // embedding it in single quotes is safe.
  const script = `cat >/dev/null 2>&1; printf '${printfPayload()}'`

  let overrideFd: number | null = null
  try {
    if (options?.ttyPath) {
      overrideFd = openSync(options.ttyPath, 'w')
    }
    const child = spawn('/bin/sh', ['-c', script, 'terminal-reset-watchdog'], {
      detached: true,
      stdio: ['pipe', overrideFd ?? 'inherit', 'ignore'],
    })
    child.on('error', () => {
      watchdog = null
    })
    // Don't let the watchdog (or our write end of its pipe) hold the event
    // loop open — the CLI must still be able to exit naturally. stdin is a
    // Socket at runtime; its unref isn't in the Writable type.
    child.unref()
    child.stdin?.on('error', () => {})
    ;(child.stdin as { unref?: () => void } | null)?.unref?.()
    watchdog = child
  } catch {
    // Best-effort: no watchdog is the pre-existing behavior.
  } finally {
    if (overrideFd !== null) {
      try {
        closeSync(overrideFd) // the child holds its own dup
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Kill the watchdog before it can fire. Called from the clean-shutdown path
 * (and safe to call multiple times). Synchronous, so it completes even inside
 * a process 'exit' handler.
 */
export function stopTerminalWatchdog(): void {
  const child = watchdog
  if (!child) return
  watchdog = null
  try {
    child.kill('SIGKILL')
  } catch {
    // Already dead — nothing to stop.
  }
}
