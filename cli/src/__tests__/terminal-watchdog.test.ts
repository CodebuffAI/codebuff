import { spawn } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterAll, describe, expect, test } from 'bun:test'

import { TERMINAL_RESET_SEQUENCES } from '../utils/terminal-reset-sequences'

import type { ChildProcess } from 'child_process'

const FIXTURE = join(import.meta.dir, 'helpers', 'terminal-watchdog-fixture.ts')

const tempDir = mkdtempSync(join(tmpdir(), 'terminal-watchdog-'))

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

function spawnFixture(mode: 'hang' | 'clean', ttyPath: string): ChildProcess {
  return spawn(process.execPath, [FIXTURE, mode, ttyPath], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

/** Resolve once the fixture prints "ready" (watchdog armed). */
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

async function pollForContent(ttyPath: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const content = readTty(ttyPath)
    if (content) return content
    await new Promise((r) => setTimeout(r, 50))
  }
  return readTty(ttyPath)
}

// POSIX uses a detached sh blocking on pipe EOF; Windows uses a PowerShell
// grandchild (outside Bun's kill-on-close job object) blocking on
// Wait-Process. Both then write the reset sequences to the injected ttyPath.
describe('terminal watchdog', () => {
  test('writes reset sequences to the tty when the process dies uncleanly', async () => {
    const ttyPath = join(tempDir, 'unclean.out')
    const child = spawnFixture('hang', ttyPath)
    await waitForReady(child)

    child.kill('SIGKILL')
    await waitForExit(child)

    // Wait-Process wakeup + write can take a few seconds under CI load.
    const written = await pollForContent(ttyPath, 15_000)
    expect(written).toBe(TERMINAL_RESET_SEQUENCES)
  }, 60_000)

  test('stays silent when the process shuts down cleanly', async () => {
    const ttyPath = join(tempDir, 'clean.out')
    const child = spawnFixture('clean', ttyPath)
    await waitForExit(child)

    // Give a disarmed-too-late watchdog time to (incorrectly) fire. Windows
    // gets longer since the watchdog wakes asynchronously via Wait-Process.
    await new Promise((r) =>
      setTimeout(r, process.platform === 'win32' ? 3_000 : 500),
    )
    expect(readTty(ttyPath)).toBe('')
  }, 60_000)
})
