/**
 * Sacrificial watchdog process that resets the terminal if the CLI dies
 * without running its own cleanup (SIGKILL, native crash, group kill).
 *
 * The in-process handlers (renderer-cleanup.ts) cover catchable exits, and
 * the npm wrapper resets when it outlives the binary — but neither survives
 * `pkill -9 node`-style sweeps that take out the wrapper and binary together,
 * and dev/direct-binary runs have no wrapper at all. This covers those.
 *
 * POSIX:
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
 * Windows (closes the codebuff#843 after-exit gap, where the hosting
 * terminal keeps sending mouse/focus VT input that the shell echoes as
 * `^[[<35;12;7M` gibberish):
 * - Bun/libuv put direct children in a kill-on-job-close job object, so a
 *   plain child — detached or not — is terminated the moment we die
 *   (oven-sh/bun#31603) and can never fire. Grandchildren of job members are
 *   NOT added to the job (silent-breakaway semantics), so we launch a
 *   short-lived PowerShell bootstrap (in the job; its death doesn't matter)
 *   that uses Start-Process -NoNewWindow to spawn the real watchdog outside
 *   the job, attached to our console.
 * - The pipe/EOF trick can't cross the bootstrap hop, so the watchdog
 *   detects our death with `Wait-Process -Id <our pid>` instead, then writes
 *   the reset sequences to its console stdout (ConPTY forwards the disable
 *   sequences to the hosting terminal).
 * - We hold no handle to the grandchild, so clean shutdown can't kill it.
 *   Instead stopTerminalWatchdog() synchronously drops a disarm file; the
 *   watchdog checks it after Wait-Process and exits silently when present.
 * - Windows PowerShell 5.1 always exists and is invoked by absolute path.
 *   Scripts are passed as plain -Command text so the command lines stay
 *   human-readable in process listings (encoded PowerShell spawned by a CLI
 *   is a classic EDR/AV malware heuristic). They are deliberately built
 *   without double quotes, which makes that quoting-safe — see
 *   spawnWindowsWatchdog.
 * - Arming takes a few hundred ms (PowerShell boot); deaths inside that
 *   window fall back to the pre-existing behavior (npm wrapper or nothing).
 */
import { spawn } from 'child_process'
import { closeSync, openSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

import { TERMINAL_RESET_SEQUENCES } from './terminal-reset-sequences'
import { getCliEnv } from './env'

import type { ChildProcess } from 'child_process'

let watchdog: ChildProcess | null = null
let disarmFilePath: string | null = null

/** Read-only watchdog state for local process diagnostics. */
export function getTerminalWatchdogDiagnostics() {
  const external = disarmFilePath !== null
  const childIsRunning = Boolean(
    watchdog?.pid &&
      watchdog.exitCode === null &&
      watchdog.signalCode === null,
  )
  return {
    armed: childIsRunning || external,
    external,
    pid: !external && childIsRunning ? watchdog?.pid : undefined,
  }
}

/** Reset payload with ESC as printf-compatible octal escapes. */
function printfPayload(): string {
  return TERMINAL_RESET_SEQUENCES.replace(/\x1b/g, '\\033')
}

function spawnPosixWatchdog(overrideFd: number | null): ChildProcess {
  // `cat` holds until our death closes the pipe; the reset then goes to the
  // watchdog's stdout (see stdio below). The payload contains no quotes, so
  // embedding it in single quotes is safe.
  const script = `cat >/dev/null 2>&1; printf '${printfPayload()}'`
  return spawn('/bin/sh', ['-c', script, 'terminal-reset-watchdog'], {
    detached: true,
    stdio: ['pipe', overrideFd ?? 'inherit', 'ignore'],
  })
}

/** Single-quote a string for PowerShell (only ' needs escaping, by doubling). */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function spawnWindowsWatchdog(options: {
  ttyPath?: string
  disarmPath: string
}): ChildProcess {
  // The payload rides as a numeric byte array, which keeps the script free of
  // double quotes and string interpolation (the no-`"` invariant the quoting
  // below relies on) and avoids any Console.Out encoding translation, so the
  // reset payload arrives byte-exact.
  const payloadBytes = Array.from(
    Buffer.from(TERMINAL_RESET_SEQUENCES, 'ascii'),
  ).join(',')
  // Tests observe a file instead of the console; production writes to the
  // watchdog's stdout, which is the console (Start-Process -NoNewWindow
  // without redirection leaves the grandchild on our console's handles).
  const writeResets = options.ttyPath
    ? `[System.IO.File]::WriteAllBytes(${psQuote(options.ttyPath)}, $b)`
    : '$s=[Console]::OpenStandardOutput(); $s.Write($b, 0, $b.Length); $s.Flush()'
  // The armed marker lets tests wait out the bootstrap hop before killing
  // the fixture; production never passes ttyPath so no marker is written.
  const armedMarker = options.ttyPath
    ? `[System.IO.File]::WriteAllText(${psQuote(options.ttyPath + '.armed')}, 'armed'); `
    : ''
  const watchdogScript =
    armedMarker +
    `try { Wait-Process -Id ${process.pid} -ErrorAction Stop } catch {}; ` +
    `if (Test-Path -LiteralPath ${psQuote(options.disarmPath)}) { ` +
    `Remove-Item -LiteralPath ${psQuote(options.disarmPath)} -Force -ErrorAction SilentlyContinue ` +
    `} else { ` +
    `$b=[byte[]](${payloadBytes}); ` +
    `${writeResets} }`

  // Windows PowerShell 5.1 ships with every supported Windows; use the
  // absolute path so a broken PATH can't take out the safety net.
  const systemRoot = getCliEnv().SystemRoot ?? 'C:\\Windows'
  const powershell = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )

  // Plain -Command (not -EncodedCommand) so the command lines are auditable
  // in process listings — encoded PowerShell trips EDR/AV heuristics. This is
  // quoting-safe because the watchdog script contains no `"` (paths are
  // single-quoted, the payload is numeric): it survives as the one
  // double-quoted region of the grandchild's argument string, which
  // Start-Process passes verbatim (single pre-built -ArgumentList string). On
  // the bootstrap's own command line those `"` are escaped as \" by spawn,
  // which powershell.exe's argv tokenizer unescapes.
  const watchdogArgs = `-NoProfile -NonInteractive -Command "${watchdogScript}"`
  const bootstrapScript =
    `Start-Process -FilePath ${psQuote(powershell)} ` +
    `-ArgumentList ${psQuote(watchdogArgs)} -NoNewWindow`

  return spawn(
    powershell,
    ['-NoProfile', '-NonInteractive', '-Command', bootstrapScript],
    {
      stdio: ['ignore', 'ignore', 'ignore'],
    },
  )
}

/**
 * Start the watchdog. Call once, before the TUI renderer starts enabling
 * terminal modes. No-op when stdout isn't a TTY (unless an explicit ttyPath
 * is injected, e.g. in tests), or if already started.
 *
 * @param options.ttyPath - Override the reset target (POSIX: the watchdog's
 *   stdout is pointed at this file; Windows: the watchdog writes the payload
 *   to this file and drops a `<ttyPath>.armed` marker once running). Tests
 *   inject a regular file here to observe what gets written.
 */
export function startTerminalWatchdog(options?: { ttyPath?: string }): void {
  if (watchdog) return
  if (!options?.ttyPath && !process.stdout.isTTY) return

  let overrideFd: number | null = null
  try {
    let child: ChildProcess
    if (process.platform === 'win32') {
      const disarmPath = path.join(
        os.tmpdir(),
        `codebuff-watchdog-disarm-${process.pid}-${Math.random().toString(36).slice(2)}`,
      )
      child = spawnWindowsWatchdog({ ttyPath: options?.ttyPath, disarmPath })
      disarmFilePath = disarmPath
    } else {
      if (options?.ttyPath) {
        overrideFd = openSync(options.ttyPath, 'w')
      }
      child = spawnPosixWatchdog(overrideFd)
    }
    child.on('error', () => {
      watchdog = null
      // A watchdog that never spawned will never consume the disarm file;
      // don't leave stopTerminalWatchdog() writing one nothing will delete.
      disarmFilePath = null
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
 * Disarm the watchdog before it can fire. Called from the clean-shutdown path
 * (and safe to call multiple times). Synchronous, so it completes even inside
 * a process 'exit' handler.
 */
export function stopTerminalWatchdog(): void {
  const child = watchdog
  const disarm = disarmFilePath
  if (!child && !disarm) return
  watchdog = null
  disarmFilePath = null
  if (disarm) {
    // Windows: the real watchdog is a grandchild we hold no handle to; it
    // checks for this file after our death and stays silent when present.
    try {
      writeFileSync(disarm, '')
    } catch {
      // Best-effort; worst case the watchdog writes resets on a clean exit,
      // which the terminal treats as no-ops.
    }
  }
  if (child) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Already dead — nothing to stop.
    }
  }
}
