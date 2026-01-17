import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { getSystemProcessEnv } from '../env'
import {
  stripColors,
  truncateStringWithMessage,
} from '../../../common/src/util/string'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const COMMAND_OUTPUT_LIMIT = 50_000

// Common locations where Git Bash might be installed on Windows
const GIT_BASH_COMMON_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Git\\bin\\bash.exe',
]

/**
 * Find bash executable on Windows.
 * Priority:
 * 1. CODEBUFF_GIT_BASH_PATH environment variable
 * 2. bash.exe in PATH (e.g., inside WSL or Git Bash terminal)
 * 3. Common Git Bash installation locations
 */
function findWindowsBash(env: NodeJS.ProcessEnv): string | null {
  // Check for user-specified path via environment variable
  const customPath = env.CODEBUFF_GIT_BASH_PATH
  if (customPath && fs.existsSync(customPath)) {
    return customPath
  }

  // Check if bash.exe is in PATH (works inside WSL or Git Bash)
  const pathEnv = env.PATH || env.Path || ''
  const pathDirs = pathEnv.split(path.delimiter)
  
  for (const dir of pathDirs) {
    const bashPath = path.join(dir, 'bash.exe')
    if (fs.existsSync(bashPath)) {
      return bashPath
    }
    // Also check for just 'bash' (for WSL)
    const bashPathNoExt = path.join(dir, 'bash')
    if (fs.existsSync(bashPathNoExt)) {
      return bashPathNoExt
    }
  }

  // Check common Git Bash installation locations
  for (const commonPath of GIT_BASH_COMMON_PATHS) {
    if (fs.existsSync(commonPath)) {
      return commonPath
    }
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
  timeout_seconds,
  env,
}: {
  command: string
  process_type: 'SYNC' | 'BACKGROUND'
  cwd: string
  timeout_seconds: number
  env?: NodeJS.ProcessEnv
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

    // Resolve cwd to absolute path
    const resolvedCwd = path.resolve(cwd)

    const childProcess = spawn(shell, [...shellArgs, command], {
      cwd: resolvedCwd,
      env: processEnv,
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''
    let timer: NodeJS.Timeout | null = null
    let processFinished = false

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

    // Collect stdout
    childProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    // Collect stderr
    childProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Handle process completion
    childProcess.on('close', (exitCode) => {
      if (processFinished) return
      processFinished = true

      if (timer) {
        clearTimeout(timer)
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

      reject(new Error(`Failed to spawn command: ${error.message}`))
    })
  })
}
