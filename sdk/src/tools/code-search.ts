import { spawn } from 'child_process'
import * as path from 'path'

import { rgPath } from '@vscode/ripgrep'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

export function codeSearch({
  projectPath,
  pattern,
  flags,
  cwd,
  maxResults = 30,
}: {
  projectPath: string
  pattern: string
  flags?: string
  cwd?: string
  maxResults?: number
}): Promise<CodebuffToolOutput<'code_search'>> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const flagsArray = (flags || '').split(' ').filter(Boolean)
    let searchCwd = projectPath
    if (cwd) {
      const requestedPath = path.resolve(projectPath, cwd)
      // Ensure the search path is within the project directory
      if (!requestedPath.startsWith(projectPath)) {
        resolve([
          {
            type: 'json',
            value: {
              errorMessage: `Invalid cwd: Path '${cwd}' is outside the project directory.`,
            },
          },
        ])
        return
      }
      searchCwd = requestedPath
    }

    const args = [...flagsArray, pattern, '.']

    const childProcess = spawn(rgPath, args, {
      cwd: searchCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    childProcess.on('close', (code) => {
      // Limit results to maxResults
      const lines = stdout.split('\n')
      const limitedLines = lines.slice(0, maxResults)
      const limitedStdout = limitedLines.join('\n')

      // Add truncation message if results were limited
      const finalStdout =
        lines.length > maxResults
          ? limitedStdout +
            `\n\n[Results limited to ${maxResults} of ${lines.length} total matches]`
          : limitedStdout

      // Truncate output to prevent memory issues
      const maxLength = 10000
      const truncatedStdout =
        finalStdout.length > maxLength
          ? finalStdout.substring(0, maxLength) + '\n\n[Output truncated]'
          : finalStdout

      const maxErrorLength = 1000
      const truncatedStderr =
        stderr.length > maxErrorLength
          ? stderr.substring(0, maxErrorLength) + '\n\n[Error output truncated]'
          : stderr

      const result = {
        stdout: truncatedStdout,
        ...(truncatedStderr && { stderr: truncatedStderr }),
        ...(code !== null && { exitCode: code }),
        message: 'Code search completed',
      }

      resolve([
        {
          type: 'json',
          value: result,
        },
      ])
    })

    childProcess.on('error', (error) => {
      resolve([
        {
          type: 'json',
          value: {
            errorMessage: `Failed to execute ripgrep: ${error.message}. Make sure ripgrep is installed and available in PATH.`,
          },
        },
      ])
    })
  })
}
