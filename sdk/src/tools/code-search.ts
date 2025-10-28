import { spawn } from 'child_process'
import * as path from 'path'

import { formatCodeSearchOutput } from '../../../common/src/util/format-code-search'
import { getBundledRgPath } from '../native/ripgrep'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

export function codeSearch({
  projectPath,
  pattern,
  flags,
  cwd,
  maxResults = 15,
  globalMaxResults = 250,
  maxOutputStringLength = 20_000,
}: {
  projectPath: string
  pattern: string
  flags?: string
  cwd?: string
  maxResults?: number
  globalMaxResults?: number
  maxOutputStringLength?: number
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

    // Always include -n flag to ensure line numbers are in output for parsing
    const args = ['-n', ...flagsArray, pattern, '.']

    const rgPath = getBundledRgPath(import.meta.url)
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
      const lines = stdout.split('\n').filter((line) => line.trim())

      // Group results by file
      const fileGroups = new Map<string, string[]>()
      let currentFile: string | null = null

      for (const line of lines) {
        // Skip separator lines between result groups
        if (line === '--') {
          continue
        }

        // Ripgrep output format:
        // - Match lines: filename:line_number:content
        // - Context lines (with -A/-B/-C flags): filename-line_number-content

        // Use regex to find the pattern: separator + digits + separator
        // This handles filenames with hyphens/colons by matching the line number pattern
        let separatorIndex = -1
        let filename = ''

        // Try match line pattern: filename:digits:content
        const matchLinePattern = /(.*?):(\d+):(.*)$/
        const matchLineMatch = line.match(matchLinePattern)
        if (matchLineMatch) {
          filename = matchLineMatch[1]
          separatorIndex = matchLineMatch[1].length
        } else {
          // Try context line pattern: filename-digits-content
          const contextLinePattern = /(.*?)-(\d+)-(.*)$/
          const contextLineMatch = line.match(contextLinePattern)
          if (contextLineMatch) {
            filename = contextLineMatch[1]
            separatorIndex = contextLineMatch[1].length
          }
        }

        if (separatorIndex === -1) {
          // Malformed line, skip it
          continue
        }

        // Check if this is a valid filename (not indented, not containing tabs)
        if (filename && !filename.includes('\t') && !filename.startsWith(' ')) {
          currentFile = filename
          if (!fileGroups.has(currentFile)) {
            fileGroups.set(currentFile, [])
          }
          fileGroups.get(currentFile)!.push(line)
        } else if (currentFile) {
          // This shouldn't happen with proper ripgrep output
          fileGroups.get(currentFile)!.push(line)
        }
      }

      // Limit results per file and globally
      const limitedLines: string[] = []
      let totalOriginalCount = 0
      let totalLimitedCount = 0
      const truncatedFiles: string[] = []
      let globalLimitReached = false
      const skippedFiles: string[] = []

      for (const [filename, fileLines] of fileGroups) {
        totalOriginalCount += fileLines.length

        // Check if we've hit the global limit
        if (totalLimitedCount >= globalMaxResults) {
          globalLimitReached = true
          skippedFiles.push(filename)
          continue
        }

        // Calculate how many results we can take from this file
        const remainingGlobalSpace = globalMaxResults - totalLimitedCount
        const resultsToTake = Math.min(
          maxResults,
          fileLines.length,
          remainingGlobalSpace,
        )
        const limited = fileLines.slice(0, resultsToTake)
        totalLimitedCount += limited.length
        limitedLines.push(...limited)

        if (fileLines.length > resultsToTake) {
          truncatedFiles.push(
            `${filename}: ${fileLines.length} results (showing ${resultsToTake})`,
          )
        }
      }

      let limitedStdout = limitedLines.join('\n')

      // Add truncation message if results were limited
      const truncationMessages: string[] = []

      if (truncatedFiles.length > 0) {
        truncationMessages.push(
          `Results limited to ${maxResults} per file. Truncated files:\n${truncatedFiles.join('\n')}`,
        )
      }

      if (globalLimitReached) {
        truncationMessages.push(
          `Global limit of ${globalMaxResults} results reached. ${skippedFiles.length} file(s) skipped:\n${skippedFiles.join('\n')}`,
        )
      }

      if (truncationMessages.length > 0) {
        limitedStdout += `\n\n[${truncationMessages.join('\n\n')}]`
      }

      const formattedStdout = formatCodeSearchOutput(limitedStdout)
      const finalStdout = formattedStdout

      // Truncate output to prevent memory issues
      const truncatedStdout =
        finalStdout.length > maxOutputStringLength
          ? finalStdout.substring(0, maxOutputStringLength) +
            '\n\n[Output truncated]'
          : finalStdout

      const maxErrorLength = maxOutputStringLength / 5
      const truncatedStderr =
        stderr.length > maxErrorLength
          ? stderr.substring(0, maxErrorLength) + '\n\n[Error output truncated]'
          : stderr

      const result = {
        stdout: truncatedStdout,
        ...(truncatedStderr && { stderr: truncatedStderr }),
        message: code !== null ? `Exit code: ${code}` : '',
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
            errorMessage: `Failed to execute ripgrep: ${error.message}. Vendored ripgrep not found; ensure @codebuff/sdk is up-to-date or set CODEBUFF_RG_PATH.`,
          },
        },
      ])
    })
  })
}
