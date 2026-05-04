#!/usr/bin/env bun
/**
 * Long-running smoke test for a compiled CLI binary.
 *
 * `--version` and `--help` exit via commander synchronously, before async
 * startup failures (e.g. the unhandled rejection from Parser.init when the
 * tree-sitter wasm load fails) get a chance to fire. This script spawns the
 * binary, lets it run for a few seconds, then kills it and asserts the TUI
 * actually rendered a known boot screen.
 *
 * The positive check matters more than the negative one: a "did the boot
 * screen appear" assertion catches *any* startup failure — known fatals,
 * novel error messages, silent crashes, hangs, segfaults that produce no
 * output. Negative pattern matches are kept only for clearer diagnostics
 * when a known regression recurs.
 *
 * Designed to run on every supported platform (Linux, macOS, Windows) without
 * extra deps. The binary doesn't need a TTY: OpenTUI emits ANSI escapes to
 * stdout regardless, and the static text we look for renders contiguously.
 *
 * Usage:
 *   bun cli/scripts/smoke-binary.ts <path-to-binary> [seconds]
 *
 * Exits 0 if a boot signal is detected and no fatal markers are present, 1
 * otherwise.
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'

// Any one of these strings appearing in stdout/stderr proves the binary
// reached its post-init UI: React tree mounted, OpenTUI rendered, async
// wasm init survived. Strings are static text from rendered components
// (not shimmer / animated) so they survive ANSI styling as contiguous
// substrings. Cover the multiple boot states the binary might land on:
//
//   - "will run commands on your behalf" — codebuff/freebuff main surface
//     header (authed + session ready)
//   - "Press ENTER to login" / "Open this URL" — login modal (no cached
//     creds — typical CI smoke)
//   - "Pick a model to start" / waiting-room copy — freebuff queue gate
//   - "Free mode isn't available" — freebuff country-block screen (CI
//     runners with anonymized-network egress like GitHub Actions land here)
//   - "Enter a coding task" — chat input prompt
const BOOT_SIGNAL_PATTERNS = [
  /will run commands on your behalf/,
  /Pick a model to start/,
  /You're in the waiting room/,
  /You're next in line/,
  /Free mode isn't available/,
  /Press ENTER to login/,
  /Open this URL/,
  /Enter a coding task/,
] as const

// Fatal markers we already know about — kept for nicer error messages on
// regressions of bugs we've already seen. The boot-signal check above is
// the real gate: it fails on *any* startup problem, including ones whose
// error text we never thought to add here.
const FATAL_PATTERNS = [
  /Fatal error during startup/i,
  /Internal error: tree-sitter\.wasm not found/i,
  /UnhandledPromiseRejection/i,
  /Cannot find module/i,
] as const

const DEFAULT_RUN_SECONDS = 5

async function main(): Promise<void> {
  const binary = process.argv[2]
  const runSeconds = Number(process.argv[3] ?? DEFAULT_RUN_SECONDS)

  if (!binary) {
    console.error('Usage: bun smoke-binary.ts <path-to-binary> [seconds]')
    process.exit(2)
  }
  if (!existsSync(binary)) {
    console.error(`smoke-binary: binary not found: ${binary}`)
    process.exit(2)
  }
  if (!Number.isFinite(runSeconds) || runSeconds <= 0) {
    console.error(`smoke-binary: bad seconds arg: ${process.argv[3]}`)
    process.exit(2)
  }

  console.log(`smoke-binary: spawning ${binary} for ${runSeconds}s…`)

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
  const exited = new Promise<void>((resolve) => {
    proc.once('exit', (code) => {
      earlyExitCode = code
      resolve()
    })
  })

  const killTimer = setTimeout(() => {
    // SIGKILL is the only signal that's portable across Linux/macOS/Windows
    // here; SIGTERM may be ignored by the renderer on some platforms.
    proc.kill('SIGKILL')
  }, runSeconds * 1_000)

  await exited
  clearTimeout(killTimer)

  const fail = (reason: string): never => {
    console.error(`smoke-binary: FAIL — ${reason} (exit code ${earlyExitCode}).`)
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
    `smoke-binary: OK (matched ${matchedSignal}, exit code ${earlyExitCode}, ${captured.length} bytes captured).`,
  )
}

main().catch((err: unknown) => {
  console.error('smoke-binary: unexpected error:', err)
  process.exit(2)
})
