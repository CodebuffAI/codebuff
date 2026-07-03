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
//   - "Pick a model to start" — freebuff model-picker landing screen
//   - "Free mode isn't available" — freebuff country-block screen (CI
//     runners with anonymized-network egress like GitHub Actions land here)
//   - "Enter a coding task" — chat input prompt
//   - OpenTUI terminal handshakes such as alternate-screen / Kitty keyboard
//     protocol enablement. On Windows GitHub Actions, the compiled binary can
//     emit the OpenTUI setup escape stream but not flush static React text
//     before the smoke timeout; that still proves the renderer reached the
//     post-init terminal surface. Tree-sitter is checked separately above, and
//     fatal markers below still fail the smoke if async startup breaks later.
const BOOT_SIGNAL_PATTERNS = [
  /will run commands on your behalf/,
  /Pick a model to start/,
  /Free mode isn't available/,
  /Press ENTER to login/,
  /Open this URL/,
  /Enter a coding task/,
  /\x1b\[\?1049h/,
  /\x1b\[\?2031h/,
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
// fires after the renderer is up). The wasm-load rejection on freebuff
// 0.0.62 surfaced through the *late* renderer-cleanup path, after the
// boot screen had already rendered.
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
// what tripped freebuff 0.0.62 in the wild while a 5s window let CI pass.
// Async wasm rejections can fire >5s after spawn (after React mounts and
// the renderer is up).
const DEFAULT_RUN_SECONDS = 10

// Windows GitHub Actions runners intermittently hang the binary's startup
// *before any output* — the renderer never reaches its first write, so the
// run captures 0 bytes and trips the boot-signal gate. Healthy runs stream
// ~17KB (alt-screen escapes + the login screen) within the window. This is a
// runner-side flake, not a product regression: the same binary boots on the
// next attempt. Retry the boot attempt a few times so a single transient
// hang doesn't fail the build. Regression detection is preserved — a known
// fatal marker fails immediately (no retry), and a genuine boot failure
// still fails after exhausting every attempt.
const MAX_BOOT_ATTEMPTS = 3

function runTreeSitterSmoke(binary: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, ['--smoke-tree-sitter'], {
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
    proc.once('exit', (code) => {
      if (code === 0 && /tree-sitter smoke ok/.test(captured)) {
        resolve()
        return
      }

      reject(
        new Error(
          `tree-sitter smoke failed with exit code ${code}\n${captured.slice(
            0,
            8 * 1024,
          )}`,
        ),
      )
    })
  })
}

type AttemptOutcome =
  | { kind: 'boot'; pattern: RegExp; bytes: number; exitCode: number | null }
  | { kind: 'fatal'; pattern: RegExp; captured: string; exitCode: number | null }
  | { kind: 'no-signal'; captured: string; exitCode: number | null }

/**
 * Spawn the binary, let it run for the full window (so *late* async startup
 * failures still have time to surface through the renderer-cleanup handler),
 * then classify the captured output.
 */
function runBootAttempt(
  binary: string,
  runSeconds: number,
): Promise<AttemptOutcome> {
  return new Promise((resolve) => {
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

    let exitCode: number | null = null
    const exited = new Promise<void>((resolveExit) => {
      proc.once('exit', (code) => {
        exitCode = code
        resolveExit()
      })
    })

    const killTimer = setTimeout(() => {
      // SIGKILL is the only signal that's portable across Linux/macOS/Windows
      // here; SIGTERM may be ignored by the renderer on some platforms.
      proc.kill('SIGKILL')
    }, runSeconds * 1_000)

    void exited.then(() => {
      clearTimeout(killTimer)

      // Negative gate first: a known fatal marker gives us a more specific
      // error message than "no boot signal found" would.
      for (const pattern of FATAL_PATTERNS) {
        if (pattern.test(captured)) {
          resolve({ kind: 'fatal', pattern, captured, exitCode })
          return
        }
      }

      // Positive gate: the binary must have rendered a known boot screen.
      const matched = BOOT_SIGNAL_PATTERNS.find((p) => p.test(captured))
      if (matched) {
        resolve({ kind: 'boot', pattern: matched, bytes: captured.length, exitCode })
        return
      }

      resolve({ kind: 'no-signal', captured, exitCode })
    })
  })
}

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

  await runTreeSitterSmoke(binary)
  console.log('smoke-binary: tree-sitter init OK.')

  let lastNoSignal: Extract<AttemptOutcome, { kind: 'no-signal' }> | null = null

  for (let attempt = 1; attempt <= MAX_BOOT_ATTEMPTS; attempt++) {
    console.log(
      `smoke-binary: boot attempt ${attempt}/${MAX_BOOT_ATTEMPTS} (running ${runSeconds}s)…`,
    )
    const outcome = await runBootAttempt(binary, runSeconds)

    if (outcome.kind === 'boot') {
      console.log(
        `smoke-binary: OK (matched ${outcome.pattern}, exit code ${outcome.exitCode}, ${outcome.bytes} bytes captured, attempt ${attempt}/${MAX_BOOT_ATTEMPTS}).`,
      )
      return
    }

    if (outcome.kind === 'fatal') {
      // Deterministic crash — a known fatal marker is a real regression, not a
      // flaky hang, so fail immediately without burning the remaining retries.
      console.error(
        `smoke-binary: FAIL — output matched ${outcome.pattern} (exit code ${outcome.exitCode}).`,
      )
      console.error('--- captured output (truncated to 8KB) ---')
      console.error(outcome.captured.slice(0, 8 * 1024))
      process.exit(1)
    }

    // no-signal: the binary produced no recognizable boot screen. This is the
    // transient-Windows-hang shape; retry before giving up.
    lastNoSignal = outcome
    console.error(
      `smoke-binary: attempt ${attempt}/${MAX_BOOT_ATTEMPTS} produced no boot signal ` +
        `(${outcome.captured.length} bytes, exit code ${outcome.exitCode})` +
        (attempt < MAX_BOOT_ATTEMPTS ? '; retrying…' : '.'),
    )
  }

  console.error(
    `smoke-binary: FAIL — binary never reached a known boot screen across ` +
      `${MAX_BOOT_ATTEMPTS} attempts — checked ${BOOT_SIGNAL_PATTERNS.length} patterns ` +
      `(exit code ${lastNoSignal?.exitCode ?? null}).`,
  )
  console.error('--- captured output from last attempt (truncated to 8KB) ---')
  console.error((lastNoSignal?.captured ?? '').slice(0, 8 * 1024))
  process.exit(1)
}

main().catch((err: unknown) => {
  console.error('smoke-binary: unexpected error:', err)
  process.exit(2)
})
