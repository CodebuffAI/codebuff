import { spawn } from 'child_process'
import * as os from 'os'
import * as path from 'path'

import {
  stripColors,
  truncateStringWithMessage,
} from '../../../common/src/util/string'
import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const COMMAND_OUTPUT_LIMIT = 50_000

export function runTerminalCommand({
  command,
  process_type,
  cwd,
  timeout_seconds,
}: {
  command: string
  process_type: 'SYNC' | 'BACKGROUND'
  cwd: string
  timeout_seconds: number
}): Promise<CodebuffToolOutput<'run_terminal_command'>> {
  if (process_type === 'BACKGROUND') {
    throw new Error('BACKGROUND process_type not implemented')
  }

  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === 'win32'
    const shell = isWindows ? 'cmd.exe' : 'bash'
    const shellArgs = isWindows ? ['/c'] : ['-c']

    // Resolve cwd to absolute path
    const resolvedCwd = path.resolve(cwd)

    const childProcess = spawn(shell, [...shellArgs, command], {
      cwd: resolvedCwd,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        CLICOLOR: '1',
        CLICOLOR_FORCE: '1',
      },
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
          childProcess.kill('SIGTERM')
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

      // Include stderr in stdout for compatibility with existing behavior
      const combinedOutput = {
        command,
        stdout: truncatedStdout,
        ...(stderr ? { stderr } : {}),
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
