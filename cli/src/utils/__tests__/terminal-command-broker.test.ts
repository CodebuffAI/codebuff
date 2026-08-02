import { describe, expect, test } from 'bun:test'
import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import {
  getActiveTerminalCommandProcesses,
  runTerminalCommand,
} from '@codebuff/sdk'

import {
  createTerminalCommandBroker,
  isTerminalCommandBrokerInvocation,
} from '../terminal-command-broker'

const brokerFixture = path.join(
  import.meta.dir,
  'fixtures',
  'terminal-command-broker-entry.ts',
)
const brokerOwnerFixture = path.join(
  import.meta.dir,
  'fixtures',
  'terminal-command-broker-owner.ts',
)
const brokerChildFixture = path.join(
  import.meta.dir,
  'fixtures',
  'terminal-command-broker-child.ts',
)

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitFor(
  condition: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) await Bun.sleep(25)
  return condition()
}

function createTestBroker() {
  return createTerminalCommandBroker({
    invocation: () => ({
      executable: process.execPath,
      args: [brokerFixture],
    }),
  })
}

function stdoutOf(
  result: Awaited<ReturnType<typeof runTerminalCommand>>,
): string {
  const value = result[0].value
  return 'stdout' in value && typeof value.stdout === 'string'
    ? value.stdout
    : ''
}

describe('terminal command broker', () => {
  test('requires its private environment marker and flag before --', () => {
    expect(
      isTerminalCommandBrokerInvocation(
        ['freebuff', '--terminal-command-broker'],
        { CODEBUFF_TERMINAL_COMMAND_BROKER: '1' },
      ),
    ).toBe(true)
    expect(
      isTerminalCommandBrokerInvocation(
        ['freebuff', '--', '--terminal-command-broker'],
        { CODEBUFF_TERMINAL_COMMAND_BROKER: '1' },
      ),
    ).toBe(false)
    expect(
      isTerminalCommandBrokerInvocation(
        ['freebuff', '--terminal-command-broker'],
        {},
      ),
    ).toBe(false)
    expect(
      isTerminalCommandBrokerInvocation(['freebuff'], {
        CODEBUFF_TERMINAL_COMMAND_BROKER: '1',
      }),
    ).toBe(false)
  })

  test('relays stdout, stderr, and the command exit code', async () => {
    const [{ value }] = await runTerminalCommand({
      command: `printf 'OUT'; printf 'ERR' >&2; exit 7`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 10,
      terminalCommandBroker: createTestBroker(),
    })

    expect('stdout' in value ? value.stdout : '').toBe('OUT')
    expect('stderr' in value ? value.stderr : '').toBe('ERR')
    expect('exitCode' in value ? value.exitCode : null).toBe(7)
  })

  test('isolates overlapping commands so one cancellation does not affect the other', async () => {
    const existing = new Set(
      getActiveTerminalCommandProcesses().map(({ pid }) => pid),
    )
    const firstAbort = new AbortController()
    const broker = createTestBroker()
    const first = runTerminalCommand({
      command: `printf 'FIRST_STARTED'; while :; do sleep 1; done`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 30,
      signal: firstAbort.signal,
      terminalCommandBroker: broker,
    })
    const second = runTerminalCommand({
      command: `sleep 1; printf 'SECOND_DONE'`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 10,
      terminalCommandBroker: broker,
    })

    expect(
      getActiveTerminalCommandProcesses().filter(
        ({ pid }) => !existing.has(pid),
      ),
    ).toHaveLength(2)
    firstAbort.abort()

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult[0].value).toMatchObject({
      message: expect.stringContaining('aborted by the user'),
    })
    expect(stdoutOf(secondResult)).toBe('SECOND_DONE')
  })

  test('surfaces helper startup failures instead of falling back to the console', async () => {
    const broker = createTerminalCommandBroker({
      invocation: () => {
        throw new Error('helper executable is unavailable')
      },
    })

    await expect(
      runTerminalCommand({
        command: `printf 'must not run'`,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: 10,
        terminalCommandBroker: broker,
      }),
    ).rejects.toThrow(
      'Failed to start terminal command broker: helper executable is unavailable',
    )
  })

  test('contains an asynchronous spawn error when the helper is missing', async () => {
    const broker = createTerminalCommandBroker({
      invocation: () => ({
        executable: path.join(
          tmpdir(),
          `missing-freebuff-broker-${crypto.randomUUID()}`,
        ),
        args: [],
      }),
    })

    await expect(
      runTerminalCommand({
        command: `printf 'must not run'`,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: 10,
        terminalCommandBroker: broker,
      }),
    ).rejects.toThrow('Failed to start terminal command broker')

    // Bun emits ENOENT after spawn() returns a child with null pipes.
    await Bun.sleep(0)
  })

  test('kills the broker process group after a timeout', async () => {
    if (process.platform === 'win32') return
    const existing = new Set(
      getActiveTerminalCommandProcesses().map(({ pid }) => pid),
    )
    const run = runTerminalCommand({
      command: `bash -c 'trap "" TERM; while :; do sleep 1; done'`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 0.05,
      terminalCommandBroker: createTestBroker(),
    })
    const tracked = getActiveTerminalCommandProcesses().find(
      ({ pid }) => !existing.has(pid),
    )
    expect(tracked).toBeDefined()

    await expect(run).rejects.toThrow('Command timed out')
    const deadline = Date.now() + 3_000
    while (
      Date.now() < deadline &&
      getActiveTerminalCommandProcesses().some(
        ({ pid }) => pid === tracked!.pid,
      )
    ) {
      await Bun.sleep(25)
    }
    expect(
      getActiveTerminalCommandProcesses().some(
        ({ pid }) => pid === tracked!.pid,
      ),
    ).toBe(false)
    expect(() => process.kill(-tracked!.pid, 0)).toThrow()
  })

  test('sweeps background descendants before successful completion', async () => {
    if (process.platform === 'win32') return
    const tempDir = mkdtempSync(path.join(tmpdir(), 'codebuff-broker-child-'))
    const pidFile = path.join(tempDir, 'child.pid')
    try {
      await runTerminalCommand({
        command: `sleep 30 >/dev/null 2>&1 & echo $! > ${JSON.stringify(pidFile)}`,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: 10,
        terminalCommandBroker: createTestBroker(),
      })

      const childPid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(Number.isInteger(childPid)).toBe(true)
      expect(() => process.kill(childPid, 0)).toThrow()
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('reaps its command when the owning CLI process disappears', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'codebuff-broker-owner-'))
    const brokerPidPath = path.join(tempDir, 'broker.pid')
    const commandPidPath = path.join(tempDir, 'command.pid')
    const owner = spawn(
      process.execPath,
      [
        brokerOwnerFixture,
        brokerFixture,
        brokerChildFixture,
        brokerPidPath,
        commandPidPath,
      ],
      { stdio: 'ignore' },
    )
    const ownerClosed = new Promise<void>((resolve) =>
      owner.once('close', () => resolve()),
    )
    let brokerPid: number | undefined
    let commandPid: number | undefined

    try {
      expect(
        await waitFor(
          () => existsSync(brokerPidPath) && existsSync(commandPidPath),
          5_000,
        ),
      ).toBe(true)
      brokerPid = Number(readFileSync(brokerPidPath, 'utf8'))
      commandPid = Number(readFileSync(commandPidPath, 'utf8'))
      expect(isProcessAlive(brokerPid)).toBe(true)
      expect(isProcessAlive(commandPid)).toBe(true)

      owner.kill('SIGKILL')
      await ownerClosed

      expect(
        await waitFor(
          () => !isProcessAlive(brokerPid!) && !isProcessAlive(commandPid!),
          4_000,
        ),
      ).toBe(true)
    } finally {
      try {
        owner.kill('SIGKILL')
      } catch {}
      if (brokerPid && isProcessAlive(brokerPid)) {
        if (process.platform === 'win32') {
          spawnSync('taskkill.exe', ['/pid', String(brokerPid), '/t', '/f'], {
            stdio: 'ignore',
            windowsHide: true,
          })
        } else {
          try {
            process.kill(-brokerPid, 'SIGKILL')
          } catch {}
        }
      }
      if (commandPid && isProcessAlive(commandPid)) {
        try {
          process.kill(commandPid, 'SIGKILL')
        } catch {}
      }
      rmSync(tempDir, { recursive: true, force: true })
    }
  }, 15_000)
})
