import { spawn, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import type {
  ChildProcess,
  ChildProcessWithoutNullStreams,
} from 'child_process'
import type { Readable } from 'stream'

import { stripColors } from '../../../common/src/util/string'
import { getSystemProcessEnv } from '../env'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const COMMAND_OUTPUT_LIMIT = 50_000
const TRUNCATION_MARKER = '\n[...TRUNCATED DUE TO LENGTH...]\n'
const MAX_PENDING_COLOR_SEQUENCE_LENGTH = 32
const INCOMPLETE_COLOR_SEQUENCE_REGEX = /\x1B\[[0-9;]*$/
// Grace period between SIGTERM and SIGKILL for commands that trap or ignore
// SIGTERM.
const KILL_ESCALATION_MS = 1500
const PROCESS_EXIT_POLL_MS = 25

export type TerminalCommandSpawnRequest = {
  executable: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/** A command process whose complete descendant tree has one owner. */
export interface TerminalCommandProcess {
  pid?: number
  stdout: Readable
  stderr: Readable
  /** Settles after stdout/stderr drain; brokers also finish tree cleanup. */
  completion: Promise<number | null>
  kill(signal: NodeJS.Signals): void
  isAlive(): boolean
}

/**
 * Host-provided process boundary for interactive applications.
 *
 * A broker must start the requested executable without attaching it to the
 * host's console and return a handle that owns the complete process tree.
 * Headless SDK consumers can omit this and use the direct process runner.
 */
export interface TerminalCommandBroker {
  start(request: TerminalCommandSpawnRequest): TerminalCommandProcess
}

/**
 * Retains a bounded prefix and suffix while continuing to drain a child
 * process's output. This keeps noisy commands from growing the CLI process to
 * multiple gigabytes before the result is truncated.
 */
export class BoundedOutputBuffer {
  private head = ''
  private tail = ''
  private truncated = false
  private pendingColorSequence = ''
  private readonly headLimit: number
  private readonly tailLimit: number

  constructor(private readonly maxLength: number) {
    if (maxLength < TRUNCATION_MARKER.length) {
      throw new Error('Output limit must fit the truncation marker')
    }
    const retainedLength = Math.max(0, maxLength - TRUNCATION_MARKER.length)
    this.headLimit = Math.ceil(retainedLength / 2)
    this.tailLimit = Math.floor(retainedLength / 2)
  }

  append(value: string): void {
    if (!value) return

    let normalized = this.pendingColorSequence + value
    this.pendingColorSequence = ''
    const incompleteColorSequence = normalized.match(
      INCOMPLETE_COLOR_SEQUENCE_REGEX,
    )?.[0]
    if (
      incompleteColorSequence &&
      incompleteColorSequence.length <= MAX_PENDING_COLOR_SEQUENCE_LENGTH
    ) {
      this.pendingColorSequence = incompleteColorSequence
      normalized = normalized.slice(0, -incompleteColorSequence.length)
    }
    normalized = stripColors(normalized)
    if (!normalized) return

    if (!this.truncated) {
      const combined = this.head + normalized
      if (combined.length <= this.maxLength) {
        this.head = combined
        return
      }

      this.truncated = true
      this.head = combined.slice(0, this.headLimit)
      this.tail = this.tailLimit === 0 ? '' : combined.slice(-this.tailLimit)
      return
    }

    this.tail =
      this.tailLimit === 0
        ? ''
        : (this.tail + normalized).slice(-this.tailLimit)
  }

  get retainedLength(): number {
    return this.head.length + this.tail.length
  }

  format(): string {
    if (!this.truncated) {
      return this.head
    }
    return this.head + TRUNCATION_MARKER + this.tail
  }
}

function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (os.platform() === 'win32' && child.pid) {
    // Node's child.kill() only terminates the direct process on Windows. Since
    // the direct process is Git Bash, killing it first can orphan Bun/Node
    // grandchildren before the later SIGKILL escalation has a tree to find.
    // taskkill snapshots and force-terminates the complete descendant tree.
    const result = spawnSync(
      'taskkill.exe',
      ['/pid', String(child.pid), '/t', '/f'],
      {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5_000,
      },
    )
    if (!result.error && result.status === 0) return
  }

  if (os.platform() !== 'win32' && child.pid) {
    try {
      // Negative pid signals the whole process group.
      process.kill(-child.pid, signal)
      return
    } catch {
      // Process group may already be gone; fall back to a direct kill.
    }
  }
  try {
    child.kill(signal)
  } catch {}
}

function isProcessGroupAlive(child: ChildProcess): boolean {
  if (!child.pid) return false
  if (os.platform() === 'win32') {
    return child.exitCode === null && child.signalCode === null
  }
  try {
    // Signal 0 checks for any remaining member without changing its state.
    process.kill(-child.pid, 0)
    return true
  } catch {
    return false
  }
}

// Children are spawned detached on POSIX (own process group) so that abort and
// timeout can kill the whole tree. That also detaches them from this process's
// lifetime, so sweep any still-running children when this process exits.
const liveChildren = new Set<TerminalCommandProcess>()
let exitSweepInstalled = false

export type ActiveTerminalCommandProcess = {
  pid: number
  processGroupId?: number
}

/**
 * Return the process IDs owned by in-flight terminal tools. Commands are
 * started in their own process group on POSIX, where the group ID matches the
 * child PID. No command text or environment is exposed: diagnostics are often
 * pasted into bug reports and those values may contain secrets.
 */
export function getActiveTerminalCommandProcesses(): ActiveTerminalCommandProcess[] {
  return Array.from(liveChildren).flatMap((child) => {
    if (!child.pid) return []
    return [
      {
        pid: child.pid,
        ...(os.platform() === 'win32' ? {} : { processGroupId: child.pid }),
      },
    ]
  })
}

function installExitSweep() {
  if (exitSweepInstalled) return
  exitSweepInstalled = true
  process.on('exit', () => {
    for (const child of liveChildren) {
      try {
        child.kill('SIGKILL')
      } catch {}
    }
  })
}

// Machine-wide Git for Windows layouts. A per-user install (no admin rights)
// lands under %LOCALAPPDATA% instead, and is found via git.exe below.
const GIT_BASH_COMMON_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Git\\bin\\bash.exe',
]

// The WSL launcher ships at C:\Windows\System32\bash.exe whether or not a
// distro is installed, so it must never be mistaken for a usable bash.
const WSL_BASH_PATH_PATTERNS = ['system32', 'windowsapps']

/**
 * Find bash executable on Windows: the CODEBUFF_GIT_BASH_PATH override, then a
 * standard install, then bash on PATH, then bash beside a git.exe on PATH —
 * the installer's default option adds only `…\Git\cmd`, which holds git.exe and
 * no bash.exe, so that last one is what finds a per-user or relocated install.
 *
 * WSL bash is never used: it fails with cryptic errors when the VM is not
 * running, on argument quoting and on UTF-16 mismatches, and with no distro
 * installed every command returns "Windows Subsystem for Linux has no installed
 * distributions."
 */
function findWindowsBash(env: NodeJS.ProcessEnv): string | null {
  const pathDirs = (env.PATH || env.Path || '')
    .split(path.delimiter)
    .filter(
      (dir) =>
        !WSL_BASH_PATH_PATTERNS.some((pattern) =>
          dir.toLowerCase().includes(pattern),
        ),
    )

  return (
    [
      env.CODEBUFF_GIT_BASH_PATH,
      ...GIT_BASH_COMMON_PATHS,
      ...pathDirs.flatMap((dir) =>
        ['bash.exe', 'bash'].map((name) => path.join(dir, name)),
      ),
      ...pathDirs
        .filter((dir) => fs.existsSync(path.join(dir, 'git.exe')))
        .map((dir) => path.join(path.dirname(dir), 'bin', 'bash.exe')),
    ].find((candidate) => candidate && fs.existsSync(candidate)) ?? null
  )
}

/**
 * Create an error message for Windows users when bash is not available.
 */
function createWindowsBashNotFoundError(): Error {
  return new Error(
    `Bash is required but was not found on this Windows system.

To fix this, you have two options:

1. Install Git for Windows (includes bash.exe):
   Download from: https://git-scm.com/download/win

2. Point at an existing bash.exe:
   Set the CODEBUFF_GIT_BASH_PATH environment variable to its location.
   Example: set CODEBUFF_GIT_BASH_PATH=C:\\path\\to\\bash.exe`,
  )
}

/**
 * Commands run under Git Bash on Windows, where `nul` is not the null device:
 * redirecting to it creates a literal file named "nul" (via an NT path that
 * bypasses the reserved-name check) that Windows tools then refuse to delete.
 * Models frequently emit cmd-style `> nul 2>&1`, so rewrite `nul` redirection
 * targets to /dev/null.
 */
export function rewriteWindowsNulRedirects(command: string): string {
  return command.replace(/([<>]\s*)nul(?![\w.])/gi, '$1/dev/null')
}

function spawnDirectTerminalCommand(
  request: TerminalCommandSpawnRequest,
): TerminalCommandProcess {
  const child: ChildProcessWithoutNullStreams = spawn(
    request.executable,
    request.args,
    {
      cwd: request.cwd,
      env: request.env,
      stdio: 'pipe',
      // The direct SDK runner owns a process group. Interactive hosts should
      // provide a broker instead, so the shell never shares their console.
      detached: true,
      windowsHide: true,
    },
  )
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  const completion = closed.then(async (exitCode) => {
    if (os.platform() === 'win32' || !isProcessGroupAlive(child)) {
      return exitCode
    }

    // SYNC commands do not transfer ownership of background descendants. Reap
    // anything the shell detached after it reported successful completion.
    killProcessGroup(child, 'SIGTERM')
    const escalationAt = Date.now() + KILL_ESCALATION_MS
    while (isProcessGroupAlive(child)) {
      if (Date.now() >= escalationAt) {
        killProcessGroup(child, 'SIGKILL')
      }
      await new Promise((resolve) => setTimeout(resolve, PROCESS_EXIT_POLL_MS))
    }
    return exitCode
  })

  return {
    pid: child.pid,
    stdout: child.stdout,
    stderr: child.stderr,
    completion,
    kill: (signal) => killProcessGroup(child, signal),
    isAlive: () => isProcessGroupAlive(child),
  }
}

export function runTerminalCommand({
  command,
  process_type,
  cwd,
  timeout_seconds,
  env,
  signal,
  terminalCommandBroker,
}: {
  command: string
  process_type: 'SYNC' | 'BACKGROUND'
  cwd: string
  timeout_seconds: number
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  terminalCommandBroker?: TerminalCommandBroker
}): Promise<CodebuffToolOutput<'run_terminal_command'>> {
  if (process_type === 'BACKGROUND') {
    throw new Error('BACKGROUND process_type not implemented')
  }

  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === 'win32'
    const processEnv = {
      ...getSystemProcessEnv(),
      ...(env ?? {}),
    } as NodeJS.ProcessEnv
    if (isWindows) {
      // Preserve other MSYS options while preventing Git Bash descendants from
      // allocating a ConPTY despite the detached/hidden process flags.
      processEnv.MSYS = [processEnv.MSYS, 'disable_pcon']
        .filter(Boolean)
        .join(' ')
    }

    const resolveAbortedBeforeSpawn = () => {
      resolve([
        {
          type: 'json',
          value: {
            command,
            message: 'Command cancelled: the run was aborted by the user.',
          },
        },
      ])
    }

    if (signal?.aborted) {
      resolveAbortedBeforeSpawn()
      return
    }

    let shell: string
    let shellArgs: string[]

    if (isWindows) {
      command = rewriteWindowsNulRedirects(command)
      const bashPath = findWindowsBash(processEnv)
      if (!bashPath) {
        reject(createWindowsBashNotFoundError())
        return
      }
      shell = bashPath
      shellArgs = ['-c']
    } else {
      shell = 'bash'
      shellArgs = ['-c']
    }

    // Resolve cwd to absolute path
    const resolvedCwd = path.resolve(cwd)

    let childProcess: TerminalCommandProcess
    try {
      const request: TerminalCommandSpawnRequest = {
        executable: shell,
        args: [...shellArgs, command],
        cwd: resolvedCwd,
        env: processEnv,
      }
      childProcess = terminalCommandBroker
        ? terminalCommandBroker.start(request)
        : spawnDirectTerminalCommand(request)
    } catch (error) {
      reject(
        new Error(
          `${terminalCommandBroker ? 'Failed to start terminal command broker' : 'Failed to spawn command'}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      return
    }

    liveChildren.add(childProcess)
    installExitSweep()

    let childLifecycleFinished = false
    const finishTrackingChild = () => {
      if (childLifecycleFinished) return
      childLifecycleFinished = true
      liveChildren.delete(childProcess)
    }

    const stdout = new BoundedOutputBuffer(COMMAND_OUTPUT_LIMIT)
    const stderr = new BoundedOutputBuffer(COMMAND_OUTPUT_LIMIT)
    let timer: NodeJS.Timeout | null = null
    let sigkillTimer: NodeJS.Timeout | null = null
    let processFinished = false

    const finishWhenProcessGroupExits = () => {
      if (!childProcess.isAlive()) {
        sigkillTimer = null
        finishTrackingChild()
        return
      }

      // Signal delivery does not imply that every process has exited yet. Keep
      // the command registered until the complete process group is gone.
      sigkillTimer = setTimeout(
        finishWhenProcessGroupExits,
        PROCESS_EXIT_POLL_MS,
      )
      sigkillTimer.unref?.()
    }

    const killChildProcess = () => {
      try {
        childProcess.kill('SIGTERM')
      } catch {}
      // Escalate in case the command traps or ignores SIGTERM.
      sigkillTimer = setTimeout(() => {
        sigkillTimer = null
        if (childProcess.isAlive()) {
          try {
            childProcess.kill('SIGKILL')
          } catch {}
        }
        finishWhenProcessGroupExits()
      }, KILL_ESCALATION_MS)
      sigkillTimer.unref?.()
    }

    const onAbort = () => {
      if (processFinished) return
      processFinished = true

      if (timer) {
        clearTimeout(timer)
      }
      killChildProcess()

      resolve([
        {
          type: 'json',
          value: {
            command,
            stdout: stdout.format(),
            ...(stderr.retainedLength > 0 ? { stderr: stderr.format() } : {}),
            message:
              'Command interrupted: the run was aborted by the user and the process was killed before it completed.',
          },
        },
      ])

      // The result is already settled; stop buffering output from a child
      // that may linger through the SIGTERM grace period.
      childProcess.stdout.destroy()
      childProcess.stderr.destroy()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
    }

    // Set up timeout if timeout_seconds >= 0 (infinite timeout when < 0)
    if (timeout_seconds >= 0 && !processFinished) {
      timer = setTimeout(() => {
        if (!processFinished) {
          processFinished = true
          signal?.removeEventListener('abort', onAbort)
          killChildProcess()
          reject(
            new Error(`Command timed out after ${timeout_seconds} seconds`),
          )
        }
      }, timeout_seconds * 1000)
    }

    // Collect stdout
    childProcess.stdout.on('data', (data: Buffer) => {
      stdout.append(data.toString())
    })

    // Collect stderr
    childProcess.stderr.on('data', (data: Buffer) => {
      stderr.append(data.toString())
    })

    // Handle process completion
    childProcess.completion
      .then((exitCode) => {
        if (sigkillTimer) {
          // A process can exit while a descendant ignores SIGTERM. Keep both
          // the registry entry and escalation timer until the owned tree dies.
          if (!childProcess.isAlive()) {
            clearTimeout(sigkillTimer)
            sigkillTimer = null
            finishTrackingChild()
          }
        } else {
          finishTrackingChild()
        }

        if (processFinished) return
        processFinished = true

        if (timer) {
          clearTimeout(timer)
        }
        signal?.removeEventListener('abort', onAbort)

        const truncatedStdout = stdout.format()
        const truncatedStderr = stderr.format()

        const combinedOutput = {
          command,
          stdout: truncatedStdout,
          ...(truncatedStderr ? { stderr: truncatedStderr } : {}),
          ...(exitCode !== null ? { exitCode } : {}),
        }

        resolve([{ type: 'json', value: combinedOutput }])
      })
      .catch((error: unknown) => {
        const wasFinished = processFinished
        processFinished = true

        if (timer) {
          clearTimeout(timer)
        }
        signal?.removeEventListener('abort', onAbort)

        if (childProcess.isAlive()) {
          if (!sigkillTimer) killChildProcess()
        } else {
          finishTrackingChild()
        }

        if (wasFinished) return

        reject(
          new Error(
            `${terminalCommandBroker ? 'Terminal command broker failed' : childProcess.pid ? 'Terminal command process failed' : 'Failed to spawn command'}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        )
      })
  })
}
