import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  stripColors,
  truncateStringWithMessage,
} from '../../../common/src/util/string'
import { getSystemProcessEnv } from '../env'
import { startBackgroundJob } from './background-jobs'
import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const COMMAND_OUTPUT_LIMIT = 50_000

// Common locations where Git Bash might be installed on Windows
const GIT_BASH_COMMON_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Git\\bin\\bash.exe',
]

// WSL bash paths that are often unreliable (VM may not be running, quote escaping issues)
// These are checked last as a fallback only
const WSL_BASH_PATH_PATTERNS = [
  'system32',
  'windowsapps',
]

/**
 * Find bash executable on Windows.
 * Priority:
 * 1. CODEBUFF_GIT_BASH_PATH environment variable (user override)
 * 2. Common Git Bash installation locations (most reliable)
 * 3. Non-WSL bash in PATH (e.g., Git Bash added to PATH)
 * 4. WSL bash in PATH (last resort - System32, WindowsApps)
 * 
 * WSL bash is deprioritized because it can fail with cryptic errors when:
 * - The WSL VM is not running
 * - Quote/argument escaping issues between Windows and Linux
 * - UTF-16 encoding mismatches
 */
function findWindowsBash(env: NodeJS.ProcessEnv): string | null {
  // Check for user-specified path via environment variable
  const customPath = env.CODEBUFF_GIT_BASH_PATH
  if (customPath && fs.existsSync(customPath)) {
    return customPath
  }

  // Check common Git Bash installation locations first (most reliable)
  for (const commonPath of GIT_BASH_COMMON_PATHS) {
    if (fs.existsSync(commonPath)) {
      return commonPath
    }
  }

  // Fall back to bash.exe in PATH, but skip WSL paths initially
  const pathEnv = env.PATH || env.Path || ''
  const pathDirs = pathEnv.split(path.delimiter)
  const wslFallbackPaths: string[] = []
  
  for (const dir of pathDirs) {
    const dirLower = dir.toLowerCase()
    const isWslPath = WSL_BASH_PATH_PATTERNS.some(pattern => dirLower.includes(pattern))
    
    const bashPath = path.join(dir, 'bash.exe')
    if (fs.existsSync(bashPath)) {
      if (isWslPath) {
        // Save WSL paths for last resort
        wslFallbackPaths.push(bashPath)
      } else {
        // Non-WSL bash in PATH (e.g., Git Bash added to PATH)
        return bashPath
      }
    }
    
    // Also check for just 'bash' (without .exe)
    const bashPathNoExt = path.join(dir, 'bash')
    if (fs.existsSync(bashPathNoExt)) {
      if (isWslPath) {
        wslFallbackPaths.push(bashPathNoExt)
      } else {
        return bashPathNoExt
      }
    }
  }

  // Last resort: use WSL bash if nothing else is available
  // WSL can be unreliable (VM not running, quote escaping issues, UTF-16 encoding)
  if (wslFallbackPaths.length > 0) {
    return wslFallbackPaths[0]
  }

  return null
}

/**
 * Create an error message for Windows users when bash is not available.
 */
function createWindowsBashNotFoundError(): Error {
  return new Error(
    `Bash is required but was not found on this Windows system.

To fix this, you have several options:

1. Install Git for Windows (includes bash.exe):
   Download from: https://git-scm.com/download/win

2. Use WSL (Windows Subsystem for Linux):
   Run in PowerShell (Admin): wsl --install
   Then run Codebuff inside WSL.

3. Set a custom bash path:
   Set the CODEBUFF_GIT_BASH_PATH environment variable to your bash.exe location.
   Example: set CODEBUFF_GIT_BASH_PATH=C:\\path\\to\\bash.exe`,
  )
}

export function runTerminalCommand({
  command,
  process_type,
  cwd,
  projectRoot,
  timeout_seconds,
  env,
  signal,
}: {
  command: string
  process_type: 'SYNC' | 'BACKGROUND'
  cwd: string
  projectRoot?: string
  timeout_seconds: number
  env?: Record<string, string | undefined>
  /** Optional abort signal. When aborted, an in-flight SYNC child is
   *  SIGTERMed (with SIGKILL fallback) and the promise rejects with the
   *  signal's reason (or a generic `AbortError`). Background jobs are
   *  unaffected — the caller can still use `kill_job` against `jobId`. */
  signal?: AbortSignal
}): Promise<CodebuffToolOutput<'run_terminal_command'>> {
  // The contract for `cwd` is "project root or a subdirectory of it". A
  // caller-supplied absolute path like `/etc` or a traversal like
  // `../../outside` must be rejected before we spawn a child process so the
  // tool cannot be used to read or mutate state outside the project.
  // The shared helper enforces lexical + realpath/symlink containment.
  const resolvedCwd = resolveFilePathWithinProject(
    projectRoot ?? process.cwd(),
    cwd,
  )
  if (resolvedCwd === null) {
    return Promise.resolve([
      {
        type: 'json',
        value: {
          command,
          errorMessage: `Invalid cwd: Path '${cwd}' is outside the project directory.`,
        },
      },
    ])
  }
  const containedCwd = resolvedCwd.fullPath

  if (process_type === 'BACKGROUND') {
    const isWindows = os.platform() === 'win32'
    const processEnv = {
      ...getSystemProcessEnv(),
      ...(env ?? {}),
    } as NodeJS.ProcessEnv

    let shell: string
    let shellArgs: string[]
    if (isWindows) {
      const bashPath = findWindowsBash(processEnv)
      if (!bashPath) {
        return Promise.reject(createWindowsBashNotFoundError())
      }
      shell = bashPath
      shellArgs = ['-c']
    } else {
      shell = 'bash'
      shellArgs = ['-c']
    }

    const job = startBackgroundJob({
      command,
      shell,
      shellArgs,
      cwd: containedCwd,
      env: processEnv,
    })

    return Promise.resolve([
      {
        type: 'json',
        value: {
          command,
          processId: job.child.pid ?? -1,
          backgroundProcessStatus: 'running',
          jobId: job.jobId,
          logFile: job.logFile,
        },
      },
    ])
  }

  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === 'win32'
    const processEnv = {
      ...getSystemProcessEnv(),
      ...(env ?? {}),
    } as NodeJS.ProcessEnv

    let shell: string
    let shellArgs: string[]

    if (isWindows) {
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

    // Use the already-resolved, project-contained cwd from the entry guard.
    const resolvedCwd = containedCwd

    const childProcess = spawn(shell, [...shellArgs, command], {
      cwd: resolvedCwd,
      env: processEnv,
      stdio: 'pipe',
    })

    // These mutable bookkeeping fields are read by `onAbort`, the timeout
    // callback, and the close/error handlers below. Declare them BEFORE
    // wiring the abort listener so `onAbort` never references a binding
    // that is still in the temporal dead zone (the JS engine hoists `let`
    // but throws on access until the declaration line runs).
    let timer: NodeJS.Timeout | null = null
    let processFinished = false
    let stdout = ''
    let stderr = ''

    // Honor an external AbortSignal: SIGTERM the child on abort, with a
    // SIGKILL fallback if it doesn't exit promptly. The promise rejects
    // with the signal's reason (or a generic `AbortError`). Only applies
    // to SYNC runs — background jobs keep running and can be cleaned up
    // via `kill_job` against the returned `jobId`.
    let abortKillTimer: NodeJS.Timeout | null = null
    const onAbort = () => {
      if (processFinished) return
      processFinished = true
      const success = childProcess.kill('SIGTERM')
      if (!success) {
        childProcess.kill('SIGKILL')
      } else {
        // Belt-and-suspenders: if SIGTERM doesn't take effect within 5s,
        // escalate to SIGKILL so a stuck shell can't wedge the run.
        abortKillTimer = setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL')
          }
        }, 5_000)
        abortKillTimer.unref?.()
      }
      if (timer) clearTimeout(timer)
      const reason = signal?.reason
      if (reason instanceof Error) {
        reject(reason)
      } else {
        const err = new Error('Aborted')
        err.name = 'AbortError'
        reject(err)
      }
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    // Set up timeout if timeout_seconds >= 0 (infinite timeout when < 0)
    if (timeout_seconds >= 0) {
      timer = setTimeout(() => {
        if (!processFinished) {
          processFinished = true
          const success = childProcess.kill('SIGTERM')
          if (!success) {
            childProcess.kill('SIGKILL')
          }
          reject(
            new Error(`Command timed out after ${timeout_seconds} seconds`),
          )
        }
      }, timeout_seconds * 1000)
    }

    // Collect stdout. Cap accumulation during streaming so a chatty process
    // can't OOM the agent runtime; final truncation at close still applies.
    // Once we exceed the cap we keep the head and tail with a truncation marker.
    const STREAM_ACCUMULATION_CAP = COMMAND_OUTPUT_LIMIT * 2
    const STREAM_TAIL_KEEP = Math.floor(COMMAND_OUTPUT_LIMIT / 4)
    const appendCapped = (current: string, chunk: string): string => {
      const next = current + chunk
      if (next.length <= STREAM_ACCUMULATION_CAP) {
        return next
      }
      // Keep head + tail to preserve both startup context and recent output.
      const head = next.slice(0, STREAM_ACCUMULATION_CAP - STREAM_TAIL_KEEP)
      const tail = next.slice(next.length - STREAM_TAIL_KEEP)
      return (
        head +
        `\n…[stream truncated ${next.length - STREAM_ACCUMULATION_CAP} chars mid-stream]\n` +
        tail
      )
    }
    childProcess.stdout.on('data', (data: Buffer) => {
      stdout = appendCapped(stdout, data.toString())
    })

    // Collect stderr (same cap)
    childProcess.stderr.on('data', (data: Buffer) => {
      stderr = appendCapped(stderr, data.toString())
    })

    // Handle process completion
    childProcess.on('close', (exitCode) => {
      if (processFinished) return
      processFinished = true

      if (timer) {
        clearTimeout(timer)
      }
      if (abortKillTimer) {
        clearTimeout(abortKillTimer)
        abortKillTimer = null
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }

      // Truncate stdout to prevent excessive output
      const truncatedStdout = truncateStringWithMessage({
        str: stripColors(stdout),
        maxLength: COMMAND_OUTPUT_LIMIT,
        remove: 'MIDDLE',
      })

      const truncatedStderr = truncateStringWithMessage({
        str: stripColors(stderr),
        maxLength: COMMAND_OUTPUT_LIMIT,
        remove: 'MIDDLE',
      })

      // Include stderr in stdout for compatibility with existing behavior
      const combinedOutput = {
        command,
        stdout: truncatedStdout,
        ...(truncatedStderr ? { stderr: truncatedStderr } : {}),
        ...(exitCode !== null ? { exitCode } : {}),
      }

      resolve([{ type: 'json', value: combinedOutput }])
    })

    // Handle spawn errors
    childProcess.on('error', (error) => {
      if (processFinished) return
      processFinished = true

      if (timer) {
        clearTimeout(timer)
      }
      if (abortKillTimer) {
        clearTimeout(abortKillTimer)
        abortKillTimer = null
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }

      reject(new Error(`Failed to spawn command: ${error.message}`))
    })
  })
}
