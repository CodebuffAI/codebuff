import { spawn, spawnSync } from 'child_process'
import { closeSync, writeSync } from 'fs'
import { Socket } from 'net'
import path from 'path'

import type {
  TerminalCommandBroker,
  TerminalCommandProcess,
  TerminalCommandSpawnRequest,
} from '@codebuff/sdk'
import type { ChildProcess } from 'child_process'
import type { Readable } from 'stream'

import { getCliEnv, getSystemProcessEnv } from './env'

export const TERMINAL_COMMAND_BROKER_FLAG = '--terminal-command-broker'
const TERMINAL_COMMAND_BROKER_ENV = 'CODEBUFF_TERMINAL_COMMAND_BROKER'

const MAX_REQUEST_BYTES = 4 * 1024 * 1024
const MAX_PROTOCOL_BYTES = 64 * 1024
const TERMINAL_COMMAND_BROKER_RECOVERY =
  'Restart Freebuff and try again. On Windows, use Windows Terminal or the VS Code terminal.'

type BrokerProtocol =
  | { ok: true; exitCode: number | null }
  | { ok: false; error: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function brokerFailure(error: unknown): Error {
  const message = errorMessage(error)
  return new Error(
    message.includes(TERMINAL_COMMAND_BROKER_RECOVERY)
      ? message
      : `${message}\n\n${TERMINAL_COMMAND_BROKER_RECOVERY}`,
  )
}

export function isTerminalCommandBrokerInvocation(
  argv: string[],
  env: NodeJS.ProcessEnv = getSystemProcessEnv(),
): boolean {
  const brokerFlagIndex = argv.indexOf(TERMINAL_COMMAND_BROKER_FLAG)
  const endOfOptionsIndex = argv.indexOf('--')
  return (
    env[TERMINAL_COMMAND_BROKER_ENV] === '1' &&
    brokerFlagIndex !== -1 &&
    (endOfOptionsIndex === -1 || brokerFlagIndex < endOfOptionsIndex)
  )
}

function isSpawnRequest(value: unknown): value is TerminalCommandSpawnRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<TerminalCommandSpawnRequest>
  return (
    typeof request.executable === 'string' &&
    request.executable.length > 0 &&
    Array.isArray(request.args) &&
    request.args.every((arg) => typeof arg === 'string') &&
    typeof request.cwd === 'string' &&
    request.cwd.length > 0 &&
    Boolean(request.env) &&
    typeof request.env === 'object' &&
    !Array.isArray(request.env) &&
    Object.values(request.env).every((value) => typeof value === 'string')
  )
}

function writeProtocol(message: BrokerProtocol): void {
  writeSync(3, `${JSON.stringify(message)}\n`)
  // Signal completion before this process reaps its own group so the parent
  // receives the result even when the shell left background descendants.
  closeSync(3)
}

function waitForParentDisconnect(): Promise<void> {
  const parentPid = process.ppid
  return new Promise<void>((resolve) => {
    let settled = false
    let parentControl: Socket | null = null
    const finish = () => {
      if (settled) return
      settled = true
      clearInterval(parentPoll)
      parentControl?.destroy()
      resolve()
    }
    const parentIsAlive = () => {
      if (process.ppid !== parentPid) return false
      try {
        process.kill(parentPid, 0)
        return true
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM'
      }
    }
    // Bun does not currently emit EOF for an extra ChildProcess stdio socket
    // after an abruptly killed parent. Polling the parent is the portable
    // fallback; the private socket still gives Node an immediate signal.
    const parentPoll = setInterval(() => {
      if (!parentIsAlive()) finish()
    }, 100)

    try {
      parentControl = new Socket({ fd: 4, readable: true, writable: false })
      parentControl.once('end', finish)
      parentControl.once('close', finish)
      parentControl.once('error', finish)
      parentControl.resume()
    } catch {
      if (!parentIsAlive()) finish()
    }
  })
}

async function reapOwnProcessGroup(): Promise<never> {
  if (process.platform === 'win32') {
    const killer = spawn(
      'taskkill.exe',
      ['/pid', String(process.pid), '/t', '/f'],
      { detached: true, stdio: 'ignore', windowsHide: true },
    )
    killer.unref()
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    process.exit(1)
  }
  try {
    process.kill(-process.pid, 'SIGKILL')
  } catch {
    process.exit(1)
  }
  process.exit(1)
}

async function readRequest(): Promise<TerminalCommandSpawnRequest> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > MAX_REQUEST_BYTES) {
      throw new Error('terminal command broker request exceeded 4 MiB')
    }
    chunks.push(buffer)
  }

  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!isSpawnRequest(value)) {
    throw new Error('terminal command broker received an invalid request')
  }
  return value
}

/** Run inside the detached helper process. It never initializes OpenTUI. */
export async function serveTerminalCommandBroker(): Promise<void> {
  const parentDisconnected = waitForParentDisconnect()
  const commandResult = (async (): Promise<BrokerProtocol> => {
    try {
      const request = await readRequest()
      const child = spawn(request.executable, request.args, {
        cwd: request.cwd,
        env: request.env,
        // Commands are non-interactive. Their output is relayed through the
        // broker, while stdin is EOF and no console handle exists to inherit.
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: false,
        windowsHide: true,
      })
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', resolve)
      })
      return { ok: true, exitCode }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  })()

  const outcome = await Promise.race([
    commandResult.then((message) => ({ kind: 'result', message }) as const),
    parentDisconnected.then(() => ({ kind: 'parent-disconnected' }) as const),
  ])
  if (outcome.kind === 'parent-disconnected') return reapOwnProcessGroup()

  try {
    writeProtocol(outcome.message)
  } catch {
    // The parent can disappear between command completion and protocol write.
    await reapOwnProcessGroup()
  }

  // Normal cleanup belongs to this detached process. In particular, Windows
  // taskkill must not block the parent CLI's renderer thread after every
  // successful command.
  await reapOwnProcessGroup()
}

function parseProtocol(value: string): BrokerProtocol {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    throw new Error('terminal command broker returned an invalid response')
  }
  if (
    parsed.ok === true &&
    'exitCode' in parsed &&
    (typeof parsed.exitCode === 'number' || parsed.exitCode === null)
  ) {
    return { ok: true, exitCode: parsed.exitCode }
  }
  if (
    parsed.ok === false &&
    'error' in parsed &&
    typeof parsed.error === 'string'
  ) {
    return { ok: false, error: parsed.error }
  }
  throw new Error('terminal command broker returned an invalid response')
}

function terminateProcessGroup(
  child: ChildProcess,
  signal: NodeJS.Signals,
): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 5_000,
    })
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {}
  }
}

function isProcessGroupAlive(child: ChildProcess): boolean {
  if (!child.pid) return false
  if (process.platform === 'win32') {
    return child.exitCode === null && child.signalCode === null
  }
  try {
    process.kill(-child.pid, 0)
    return true
  } catch {
    return false
  }
}

function defaultBrokerInvocation(): {
  executable: string
  args: string[]
} {
  return {
    executable: process.execPath,
    args:
      getCliEnv().CODEBUFF_IS_BINARY === 'true'
        ? [TERMINAL_COMMAND_BROKER_FLAG]
        : [
            path.join(import.meta.dir, '..', 'entry.ts'),
            TERMINAL_COMMAND_BROKER_FLAG,
          ],
  }
}

export function createTerminalCommandBroker({
  invocation = defaultBrokerInvocation,
  terminate = terminateProcessGroup,
}: {
  invocation?: () => { executable: string; args: string[] }
  terminate?: typeof terminateProcessGroup
} = {}): TerminalCommandBroker {
  return {
    start(request): TerminalCommandProcess {
      let child: ChildProcess
      try {
        const { executable, args } = invocation()
        child = spawn(executable, args, {
          env: {
            ...getSystemProcessEnv(),
            [TERMINAL_COMMAND_BROKER_ENV]: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
          detached: true,
          windowsHide: true,
        })
      } catch (error) {
        throw brokerFailure(error)
      }
      // Bun can return a child with null pipes for ENOENT, then emit the spawn
      // error asynchronously. Always observe it, including the synchronous
      // validation-failure path below, so a missing helper cannot crash the CLI.
      child.once('error', () => {})
      const protocol = child.stdio[3] as Readable | null
      const parentControl = child.stdio[4]
      if (
        !child.stdin ||
        !child.stdout ||
        !child.stderr ||
        !protocol ||
        !parentControl
      ) {
        terminate(child, 'SIGKILL')
        throw brokerFailure('could not open terminal command broker pipes')
      }

      // Cancellation can close the broker while this small request is still
      // flushing. The process completion path reports real startup failures;
      // keep a late EPIPE from becoming an unrelated uncaught exception.
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify(request))

      const protocolResult = new Promise<BrokerProtocol>((resolve, reject) => {
        const chunks: Buffer[] = []
        let totalBytes = 0
        protocol.on('data', (chunk: Buffer) => {
          const buffer = Buffer.from(chunk)
          totalBytes += buffer.length
          if (totalBytes > MAX_PROTOCOL_BYTES) {
            reject(new Error('terminal command broker response was too large'))
            protocol.destroy()
            return
          }
          chunks.push(buffer)
        })
        protocol.once('error', reject)
        protocol.once('end', () => {
          try {
            resolve(
              parseProtocol(Buffer.concat(chunks).toString('utf8').trim()),
            )
          } catch (error) {
            reject(error)
          }
        })
      })
      const closed = new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', () => resolve())
      })
      const completion = Promise.all([protocolResult, closed])
        .catch((error) => {
          throw brokerFailure(error)
        })
        .then(([message]) => {
          if (!message.ok) throw new Error(message.error)
          return message.exitCode
        })

      return {
        pid: child.pid,
        stdout: child.stdout,
        stderr: child.stderr,
        completion,
        kill: (signal) => terminate(child, signal),
        isAlive: () => isProcessGroupAlive(child),
      }
    },
  }
}

export const terminalCommandBroker = createTerminalCommandBroker()
