import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  BoundedOutputBuffer,
  getActiveTerminalCommandProcesses,
  runTerminalCommand,
} from '../tools/run-terminal-command'

describe('BoundedOutputBuffer', () => {
  test('preserves output below the limit and strips terminal colors', () => {
    const output = new BoundedOutputBuffer(100)
    output.append('\u001b[31')
    output.append('mhello\u001b[0m world')

    expect(output.format()).toBe('hello world')
  })

  test('keeps a bounded prefix and suffix for oversized output', () => {
    const output = new BoundedOutputBuffer(100)
    output.append('start-' + 'x'.repeat(200) + '-end')

    expect(output.retainedLength).toBeLessThanOrEqual(100)
    expect(output.format()).toHaveLength(100)
    expect(output.format()).toStartWith('start-')
    expect(output.format()).toContain('[...TRUNCATED DUE TO LENGTH...]')
    expect(output.format()).toEndWith('-end')
  })

  test('applies the output limit after removing color sequences', () => {
    const output = new BoundedOutputBuffer(100)
    output.append(`start-${'\u001b[31mx\u001b[0m'.repeat(200)}-end`)

    expect(output.format()).toHaveLength(100)
    expect(output.format()).toStartWith('start-')
    expect(output.format()).toEndWith('-end')
    expect(output.format()).not.toContain('\u001b[')
  })

  test('does not grow as more chunks arrive after truncation', () => {
    const output = new BoundedOutputBuffer(100)

    for (let i = 0; i < 1_000; i++) {
      output.append(`chunk-${i.toString().padStart(4, '0')}`)
    }

    expect(output.retainedLength).toBeLessThanOrEqual(100)
    expect(output.format()).toStartWith('chunk-0000')
    expect(output.format()).toEndWith('chunk-0999')
  })
})

describe('terminal command process diagnostics', () => {
  test('tracks a command until its process exits', async () => {
    const existingPids = new Set(
      getActiveTerminalCommandProcesses().map((child) => child.pid),
    )
    const controller = new AbortController()
    const run = runTerminalCommand({
      command: `bun -e "setInterval(() => {}, 1000)"`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 30,
      signal: controller.signal,
    })

    const active = getActiveTerminalCommandProcesses()
    const tracked = active.find((child) => !existingPids.has(child.pid))
    expect(tracked).toBeDefined()
    const pid = tracked!.pid
    if (process.platform !== 'win32') {
      expect(tracked!.processGroupId).toBe(pid)
    }

    controller.abort()
    await run
    for (let i = 0; i < 20; i++) {
      if (
        !getActiveTerminalCommandProcesses().some((child) => child.pid === pid)
      ) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(
      getActiveTerminalCommandProcesses().some((child) => child.pid === pid),
    ).toBe(false)
  })

  test('escalates when a grandchild ignores SIGTERM', async () => {
    if (process.platform === 'win32') return

    const existingPids = new Set(
      getActiveTerminalCommandProcesses().map((child) => child.pid),
    )
    const controller = new AbortController()
    const run = runTerminalCommand({
      command: `bash -c 'trap "" TERM; while :; do sleep 1; done'`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 30,
      signal: controller.signal,
    })
    const tracked = getActiveTerminalCommandProcesses().find(
      (child) => !existingPids.has(child.pid),
    )
    expect(tracked).toBeDefined()

    await new Promise((resolve) => setTimeout(resolve, 100))
    controller.abort()
    await run
    expect(
      getActiveTerminalCommandProcesses().some(
        (child) => child.pid === tracked!.pid,
      ),
    ).toBe(true)

    const processGroupIsAlive = () => {
      try {
        process.kill(-tracked!.pid, 0)
        return true
      } catch {
        return false
      }
    }
    const deadline = Date.now() + 3_000
    while (
      Date.now() < deadline &&
      (getActiveTerminalCommandProcesses().some(
        (child) => child.pid === tracked!.pid,
      ) ||
        processGroupIsAlive())
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(
      getActiveTerminalCommandProcesses().some(
        (child) => child.pid === tracked!.pid,
      ),
    ).toBe(false)
    expect(processGroupIsAlive()).toBe(false)
  })

  test('cancels a detached Windows grandchild with its terminal-tool tree', async () => {
    if (process.platform !== 'win32') return

    const tempDir = mkdtempSync(join(tmpdir(), 'codebuff-process-tree-'))
    const pidFile = join(tempDir, 'grandchild.pid')
    const fixture = join(
      import.meta.dir,
      'fixtures',
      'windows-stubborn-grandchild.ts',
    )
    const bashPath = (value: string) => value.replaceAll('\\', '/')
    const isAlive = (pid: number) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    const controller = new AbortController()
    let parentPid: number | undefined
    let grandchildPid: number | undefined

    try {
      const existingPids = new Set(
        getActiveTerminalCommandProcesses().map((child) => child.pid),
      )
      const run = runTerminalCommand({
        command: `bun ${JSON.stringify(bashPath(fixture))} ${JSON.stringify(bashPath(pidFile))}`,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: 30,
        signal: controller.signal,
      })
      const shellPid = getActiveTerminalCommandProcesses().find(
        (child) => !existingPids.has(child.pid),
      )?.pid
      expect(shellPid).toBeDefined()

      const readyDeadline = Date.now() + 5_000
      while (!existsSync(pidFile) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      expect(existsSync(pidFile)).toBe(true)
      const fixturePids = JSON.parse(readFileSync(pidFile, 'utf8')) as {
        parentPid: number
        grandchildPid: number
      }
      parentPid = fixturePids.parentPid
      grandchildPid = fixturePids.grandchildPid
      expect(Number.isInteger(parentPid)).toBe(true)
      expect(Number.isInteger(grandchildPid)).toBe(true)
      // The fixture's detached grandchild would outlive a direct kill of the
      // shell parent. Windows tree cancellation must remove all three PIDs.
      expect(() => process.kill(shellPid!, 0)).not.toThrow()
      expect(() => process.kill(parentPid!, 0)).not.toThrow()
      expect(() => process.kill(grandchildPid!, 0)).not.toThrow()

      controller.abort()
      await run

      const stoppedDeadline = Date.now() + 5_000
      while (
        Date.now() < stoppedDeadline &&
        (isAlive(shellPid!) || isAlive(parentPid!) || isAlive(grandchildPid!))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      expect(() => process.kill(shellPid!, 0)).toThrow()
      expect(() => process.kill(parentPid!, 0)).toThrow()
      expect(() => process.kill(grandchildPid!, 0)).toThrow()
    } finally {
      controller.abort()
      if (parentPid) {
        spawnSync('taskkill.exe', ['/pid', String(parentPid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      }
      if (grandchildPid) {
        spawnSync('taskkill.exe', ['/pid', String(grandchildPid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      }
      rmSync(tempDir, { recursive: true, force: true })
    }
  }, 25_000)
})
