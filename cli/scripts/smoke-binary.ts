#!/usr/bin/env bun
/**
 * Long-running smoke test for a compiled CLI binary.
 *
 * `--version` and `--help` exit via commander synchronously, before async
 * startup failures (e.g. the unhandled rejection from Parser.init when the
 * tree-sitter wasm load fails) get a chance to fire. This script first runs
 * deterministic tree-sitter and OpenTUI-native probes. It can then spawn the
 * full CLI, let it run for a few seconds, and assert that the TUI rendered a
 * known boot screen.
 *
 * The positive check matters more than the negative one: a "did the boot
 * screen appear" assertion catches *any* startup failure — known fatals,
 * novel error messages, silent crashes, hangs, segfaults that produce no
 * output. Negative pattern matches are kept only for clearer diagnostics
 * when a known regression recurs.
 *
 * Full-screen output through a pipe is not deterministic on every supported
 * runtime (legacy Intel macOS may initialize correctly without painting).
 * Pass `--probe-only` there: it still exercises both packaged native/wasm
 * dependencies without treating terminal presentation as a portability API.
 *
 * Usage:
 *   bun cli/scripts/smoke-binary.ts <path-to-binary> [seconds] [--probe-only]
 *
 * Exits 0 if the deterministic probes pass and, unless probe-only, a boot
 * signal is detected with no fatal markers; exits 1 otherwise.
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'

// Any one of these strings appearing in stdout/stderr proves the binary
// reached its post-init UI: React tree mounted, OpenTUI rendered, async
// wasm init survived. Strings are static text from rendered components
// (not shimmer / animated) so they survive ANSI styling as contiguous
// substrings. Cover the multiple boot states the binary might land on:
//
//   - "will run commands on your behalf" — main surface header
//     (authed + session ready)
//   - "Press ENTER to login" / "Open this URL" — login modal (no cached
//     creds — typical CI smoke)
//   - "Enter a coding task" — chat input prompt
//   - DEC alternate-screen activation — OpenTUI renderer initialized and
//     began painting even if capability negotiation fragmented later labels.
const BOOT_SIGNAL_PATTERNS = [
  /will run commands on your behalf/,
  /Press ENTER to login/,
  /Open this URL/,
  /Enter a coding task/,
  /\x1b\[\?1049h/,
] as const

// Fatal markers we already know about — kept for nicer error messages on
// regressions of bugs we've already seen. The boot-signal check above is
// the real gate: it fails on *any* startup problem, including ones whose
// error text we never thought to add here.
//
// Note both paths the cli error handlers print: "Fatal error during
// startup" (earlyFatalHandler in cli/src/index.tsx, fires while main()
// is still wiring up) and "Unhandled rejection:" / "Uncaught exception:"
// (installProcessCleanupHandlers in cli/src/utils/renderer-cleanup.ts,
// fires after the renderer is up). Wasm-load rejections can surface through
// the *late* renderer-cleanup path, after the boot screen has already rendered.
const FATAL_PATTERNS = [
  /Fatal error during startup/i,
  /Unhandled rejection:/i,
  /Uncaught exception:/i,
  /Internal error: tree-sitter\.wasm not found/i,
  /UnhandledPromiseRejection/i,
  /Cannot find module/i,
] as const

// Long enough that an unhandled rejection from the eager Parser.init has
// time to surface through the renderer-cleanup handler — that path is
// past startup incidents while a 5s window let CI pass. Async wasm rejections
// can fire >5s after spawn (after React mounts and
// the renderer is up).
const DEFAULT_RUN_SECONDS = 10

type ProcessResult = {
  captured: string
  code: number | null
  signal: NodeJS.Signals | null
}

function runProbe(binary: string, flag: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, [flag], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
    })

    let captured = ''
    const append = (chunk: Buffer): void => {
      captured += chunk.toString('utf8')
    }
    proc.stdout?.on('data', append)
    proc.stderr?.on('data', append)

    proc.once('error', reject)
    proc.once('exit', (code, signal) => {
      resolve({ captured, code, signal })
    })
  })
}

async function requireProbe(
  binary: string,
  flag: string,
  marker: RegExp,
  label: string,
): Promise<void> {
  const result = await runProbe(binary, flag)
  if (result.code === 0 && marker.test(result.captured)) return

  throw new Error(
    `${label} smoke failed (${formatExit(result.code, result.signal)})\n${result.captured.slice(
      0,
      8 * 1024,
    )}`,
  )
}

function formatExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (signal) return `signal ${signal}`
  return `exit code ${code}`
}

async function main(): Promise<void> {
  const binary = process.argv[2]
  const probeOnly = process.argv.includes('--probe-only')
  const secondsArg = process.argv.slice(3).find((arg) => arg !== '--probe-only')
  const runSeconds = Number(secondsArg ?? DEFAULT_RUN_SECONDS)

  if (!binary) {
    console.error(
      'Usage: bun smoke-binary.ts <path-to-binary> [seconds] [--probe-only]',
    )
    process.exit(2)
  }
  if (!existsSync(binary)) {
    console.error(`smoke-binary: binary not found: ${binary}`)
    process.exit(2)
  }
  if (!Number.isFinite(runSeconds) || runSeconds <= 0) {
    console.error(`smoke-binary: bad seconds arg: ${secondsArg}`)
    process.exit(2)
  }

  console.log(`smoke-binary: probing ${binary}…`)

  await requireProbe(
    binary,
    '--smoke-tree-sitter',
    /tree-sitter smoke ok/,
    'tree-sitter',
  )
  console.log('smoke-binary: tree-sitter init OK.')

  await requireProbe(binary, '--smoke-opentui', /opentui smoke ok/, 'OpenTUI')
  console.log('smoke-binary: OpenTUI native init OK.')

  if (probeOnly) {
    console.log('smoke-binary: OK (deterministic probes passed).')
    return
  }

  console.log(`smoke-binary: spawning full TUI for ${runSeconds}s…`)

  const proc = spawn(binary, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
  })

  let captured = ''
  const append = (chunk: Buffer): void => {
    captured += chunk.toString('utf8')
  }
  proc.stdout?.on('data', append)
  proc.stderr?.on('data', append)

  let earlyExitCode: number | null = null
  let exitSignal: NodeJS.Signals | null = null
  const exited = new Promise<void>((resolve) => {
    proc.once('exit', (code, signal) => {
      earlyExitCode = code
      exitSignal = signal
      resolve()
    })
  })

  let timedOut = false
  const killTimer = setTimeout(() => {
    // SIGKILL is the only signal that's portable across Linux/macOS/Windows
    // here; SIGTERM may be ignored by the renderer on some platforms.
    timedOut = true
    proc.kill('SIGKILL')
  }, runSeconds * 1_000)

  await exited
  clearTimeout(killTimer)

  const fail = (reason: string): never => {
    console.error(
      `smoke-binary: FAIL — ${reason} (${formatExit(earlyExitCode, exitSignal)}).`,
    )
    console.error('--- captured output (truncated to 8KB) ---')
    console.error(captured.slice(0, 8 * 1024))
    process.exit(1)
  }

  // Negative gate first: a known fatal marker gives us a more specific error
  // message than "no boot signal found" would. Both gates would fire on a
  // crash; preferring the negative one just makes the failure log clearer.
  for (const pattern of FATAL_PATTERNS) {
    if (pattern.test(captured)) {
      fail(`output matched ${pattern}`)
    }
  }

  if (!timedOut && (exitSignal !== null || earlyExitCode !== 0)) {
    fail('binary terminated before the smoke timeout')
  }

  // Positive gate: the binary must have rendered a known boot screen. This
  // is the load-bearing assertion — it catches *any* startup failure (silent
  // crashes, hangs, novel error messages, segfaults), not just the listed
  // fatals.
  const matchedSignal = BOOT_SIGNAL_PATTERNS.find((p) => p.test(captured))
  if (!matchedSignal) {
    fail(
      `binary never reached a known boot screen — checked ${BOOT_SIGNAL_PATTERNS.length} patterns`,
    )
  }

  console.log(
    `smoke-binary: OK (matched ${matchedSignal}, ${formatExit(earlyExitCode, exitSignal)}, ${captured.length} bytes captured).`,
  )
}

main().catch((err: unknown) => {
  console.error('smoke-binary: unexpected error:', err)
  process.exit(2)
})
