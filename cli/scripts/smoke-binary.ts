#!/usr/bin/env bun
/**
 * Long-running smoke test for a compiled CLI binary.
 *
 * `--version` and `--help` exit via commander synchronously, before async
 * startup failures (e.g. the unhandled rejection from Parser.init when the
 * tree-sitter wasm load fails) get a chance to fire. This script spawns the
 * binary, lets it run for a few seconds, then kills it and asserts no fatal
 * startup markers showed up in stdout/stderr.
 *
 * Designed to run on every supported platform (Linux, macOS, Windows) without
 * extra deps. The binary doesn't need a TTY: `earlyFatalHandler` in
 * `cli/src/index.tsx` writes its diagnostic to stdout/stderr regardless.
 *
 * Usage:
 *   bun cli/scripts/smoke-binary.ts <path-to-binary> [seconds]
 *
 * Exits 0 if no fatal markers detected, 1 otherwise.
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'

// Markers that indicate the CLI crashed during startup. Match what
// `earlyFatalHandler` writes plus the specific tree-sitter regression.
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

  for (const pattern of FATAL_PATTERNS) {
    if (pattern.test(captured)) {
      console.error(
        `smoke-binary: FAIL — output matched ${pattern} (exit code ${earlyExitCode}).`,
      )
      console.error('--- captured output (truncated to 8KB) ---')
      console.error(captured.slice(0, 8 * 1024))
      process.exit(1)
    }
  }

  console.log(
    `smoke-binary: OK (exit code ${earlyExitCode}, ${captured.length} bytes captured).`,
  )
}

main().catch((err: unknown) => {
  console.error('smoke-binary: unexpected error:', err)
  process.exit(2)
})
