import { spawn } from 'child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterAll, describe, expect, test } from 'bun:test'

import { TERMINAL_RESET_SEQUENCES } from '../utils/terminal-reset-sequences'

import type { ChildProcess } from 'child_process'

const FIXTURE = join(import.meta.dir, 'helpers', 'terminal-watchdog-fixture.ts')
const WINDOWS_WATCHDOG_ENV: Record<string, string> =
  process.platform === 'win32' ? { CODEBUFF_ENABLE_TERMINAL_WATCHDOG: '1' } : {}

const tempDir = mkdtempSync(join(tmpdir(), 'terminal-watchdog-'))

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

function spawnFixture(
  mode: 'hang' | 'clean',
  ttyPath: string,
  env?: Record<string, string>,
): ChildProcess {
  const childEnv = { ...process.env }
  delete childEnv.CODEBUFF_ENABLE_TERMINAL_WATCHDOG
  delete childEnv.CODEBUFF_NO_TERMINAL_WATCHDOG
  return spawn(process.execPath, [FIXTURE, mode, ttyPath], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...childEnv, ...env },
  })
}

/** Resolve once the fixture prints "ready" (watchdog policy applied). */
function waitForReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let out = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes('ready')) resolve()
    })
    child.on('exit', () => resolve()) // "clean" mode exits after arming
    child.on('error', reject)
  })
}

function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    child.on('exit', () => resolve())
  })
}

function readTty(ttyPath: string): string {
  try {
    return readFileSync(ttyPath, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Disarm files the fixture left in the temp dir (Windows watchdog only;
 * POSIX never creates one). Named codebuff-watchdog-disarm-<pid>-<random>.
 */
function findDisarmFiles(pid: number | undefined): string[] {
  return readdirSync(tmpdir()).filter((name) =>
    name.startsWith(`codebuff-watchdog-disarm-${pid}-`),
  )
}

const WATCHDOG_WRITE_TIMEOUT_MS = process.platform === 'win32' ? 45_000 : 15_000

async function pollForContent(
  ttyPath: string,
  expected: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const content = readTty(ttyPath)
    if (content === expected) return content
    await new Promise((r) => setTimeout(r, 50))
  }
  return readTty(ttyPath)
}

// POSIX uses a detached sh blocking on pipe EOF. When explicitly enabled,
// Windows uses a PowerShell grandchild (outside Bun's kill-on-close job object)
// blocking on Wait-Process. Both then write the reset sequences to ttyPath.
describe('terminal watchdog', () => {
  test.skipIf(process.platform !== 'win32')(
    'does not arm by default on Windows',
    async () => {
      const ttyPath = join(tempDir, 'windows-default.out')
      const child = spawnFixture('hang', ttyPath)
      await waitForReady(child)

      const armed = existsSync(`${ttyPath}.armed`)
      child.kill('SIGKILL')
      await waitForExit(child)

      expect(armed).toBe(false)
      expect(readTty(ttyPath)).toBe('')
    },
    60_000,
  )

  test('writes reset sequences to the tty when the process dies uncleanly', async () => {
    const ttyPath = join(tempDir, 'unclean.out')
    const child = spawnFixture('hang', ttyPath, WINDOWS_WATCHDOG_ENV)
    await waitForReady(child)

    child.kill('SIGKILL')
    await waitForExit(child)

    const written = await pollForContent(
      ttyPath,
      TERMINAL_RESET_SEQUENCES,
      WATCHDOG_WRITE_TIMEOUT_MS,
    )
    expect(written).toBe(TERMINAL_RESET_SEQUENCES)
  }, 120_000)

  // The Windows arm path spawns a PowerShell bootstrap that Start-Process's a
  // second, longer-lived PowerShell — a shape EDR/AV scores as malicious. The
  // opt-out lets an affected user keep running the CLI at the cost of the
  // after-exit terminal repair, so "no watchdog at all" has to actually hold.
  test.each(['1', 'true', 'TRUE'])(
    'never arms when CODEBUFF_NO_TERMINAL_WATCHDOG=%s',
    async (value) => {
      const ttyPath = join(tempDir, `optout-${value}.out`)
      const child = spawnFixture('hang', ttyPath, {
        ...WINDOWS_WATCHDOG_ENV,
        CODEBUFF_NO_TERMINAL_WATCHDOG: value,
      })
      await waitForReady(child)

      child.kill('SIGKILL')
      await waitForExit(child)

      // Generous wait: a watchdog that DID arm would have written by now, so a
      // short sleep here would make this pass for the wrong reason.
      await new Promise((r) => setTimeout(r, 3_000))
      expect(readTty(ttyPath)).toBe('')
      expect(findDisarmFiles(child.pid)).toEqual([])
    },
    60_000,
  )

  test('still arms when the opt-out is set to an unrelated value', async () => {
    const ttyPath = join(tempDir, 'optout-noise.out')
    const child = spawnFixture('hang', ttyPath, {
      ...WINDOWS_WATCHDOG_ENV,
      CODEBUFF_NO_TERMINAL_WATCHDOG: '0',
    })
    await waitForReady(child)

    child.kill('SIGKILL')
    await waitForExit(child)

    const written = await pollForContent(
      ttyPath,
      TERMINAL_RESET_SEQUENCES,
      WATCHDOG_WRITE_TIMEOUT_MS,
    )
    expect(written).toBe(TERMINAL_RESET_SEQUENCES)
  }, 120_000)

  test('stays silent when the process shuts down cleanly', async () => {
    const ttyPath = join(tempDir, 'clean.out')
    const child = spawnFixture('clean', ttyPath, WINDOWS_WATCHDOG_ENV)
    await waitForExit(child)

    // Give a disarmed-too-late watchdog time to (incorrectly) fire. Windows
    // gets longer since the watchdog wakes asynchronously via Wait-Process.
    await new Promise((r) =>
      setTimeout(r, process.platform === 'win32' ? 3_000 : 500),
    )
    expect(readTty(ttyPath)).toBe('')

    // The watchdog consumes (deletes) the disarm file when it wakes, so
    // clean exits must not litter the temp dir.
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && findDisarmFiles(child.pid).length > 0) {
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(findDisarmFiles(child.pid)).toEqual([])
  }, 60_000)
})
