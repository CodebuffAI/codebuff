import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { formatCodeSearchOutput } from '../../../common/src/util/format-code-search'
import { getBundledRgPath } from '../native/ripgrep'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

// Hidden directories to include in code search by default.
// These are searched in addition to '.' to ensure important config/workflow files are discoverable.
const INCLUDED_HIDDEN_DIRS = [
  '.agents', // Codebuff agent definitions
  '.claude', // Claude settings
  '.github', // GitHub Actions, workflows, issue templates
  '.gitlab', // GitLab CI configuration
  '.circleci', // CircleCI configuration
  '.husky', // Git hooks
]

export function codeSearch({
  projectPath,
  pattern,
  flags,
  cwd,
  maxResults = 15,
  globalMaxResults = 250,
  maxOutputStringLength = 20_000,
  timeoutSeconds = 10,
}: {
  projectPath: string
  pattern: string
  flags?: string
  cwd?: string
  maxResults?: number
  globalMaxResults?: number
  maxOutputStringLength?: number
  timeoutSeconds?: number
}): Promise<CodebuffToolOutput<'code_search'>> {
  return new Promise((resolve) => {
    let isResolved = false

    // Guard paths robustly
    const projectRoot = path.resolve(projectPath)
    const searchCwd = cwd ? path.resolve(projectRoot, cwd) : projectRoot

    // Ensure the resolved path is within the project directory
    if (
      !searchCwd.startsWith(projectRoot + path.sep) &&
      searchCwd !== projectRoot
    ) {
      return resolve([
        {
          type: 'json',
          value: {
            errorMessage: `Invalid cwd: Path '${cwd}' is outside the project directory.`,
          },
        },
      ])
    }

    // Parse flags - do NOT deduplicate to preserve flag-argument pairs like '-g *.ts'
    // Deduplicating would break up these pairs and cause errors
    const flagsArray = (flags || '').split(' ').filter(Boolean)

    // Use JSON output for robust parsing and early stopping
    // --no-config prevents user/system .ripgreprc from interfering
    // -n shows line numbers
    // --json outputs in JSON format, which streams in and allows us to cut off the output if it grows too long
    // "--"" prevents pattern from being misparsed as a flag (e.g., pattern starting with '-')
    // Search paths: '.' plus blessed hidden directories that actually exist
    // Filter out non-existent directories to avoid ripgrep stderr errors
    const existingHiddenDirs = INCLUDED_HIDDEN_DIRS.filter((dir) => {
      try {
        return fs.statSync(path.join(searchCwd, dir)).isDirectory()
      } catch {
        return false
      }
    })
    const searchPaths = ['.', ...existingHiddenDirs]
    const args = [
      '--no-config',
      '-n',
      '--json',
      ...flagsArray,
      '--',
      pattern,
      ...searchPaths,
    ]

    const rgPath = getBundledRgPath(import.meta.url)
    const childProcess = spawn(rgPath, args, {
      cwd: searchCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let jsonRemainder = ''
    let stderrBuf = ''
    // Track matches by file for grouping and limiting
    const fileGroups = new Map<string, string[]>()
    // Track match count per file separately from total lines
    const fileMatchCounts = new Map<string, number>()
    let matchesGlobal = 0
    let estimatedOutputLen = 0
    let killedForLimit = false

    const settle = (payload: any) => {
      if (isResolved) return
      isResolved = true

      // Clean up listeners immediately
      childProcess.stdout.removeAllListeners()
      childProcess.stderr.removeAllListeners()
      childProcess.removeAllListeners()

      clearTimeout(timeoutId)
      resolve([{ type: 'json', value: payload }])
    }

    const hardKill = () => {
      try {
        childProcess.kill('SIGTERM')
      } catch {}
      setTimeout(() => {
        try {
          // SIGKILL doesn't exist on Windows, fall back to no-signal kill
          childProcess.kill('SIGKILL') || childProcess.kill()
        } catch {}
      }, 1000)
    }

    const timeoutId = setTimeout(() => {
      if (isResolved) return
      hardKill()

      // Build output from collected matches
      const collectedLines: string[] = []
      for (const fileLines of fileGroups.values()) {
        collectedLines.push(...fileLines)
      }
      const partialOutput = collectedLines.join('\n')

      const truncatedStdout =
        partialOutput.length > 1000
          ? partialOutput.substring(0, 1000) + '\n\n[Output truncated]'
          : partialOutput
      const truncatedStderr =
        stderrBuf.length > 1000
          ? stderrBuf.substring(0, 1000) + '\n\n[Error output truncated]'
          : stderrBuf

      settle({
        errorMessage: `Code search timed out after ${timeoutSeconds} seconds. The search may be too broad or the pattern too complex. Try narrowing your search with more specific flags or a more specific pattern.`,
        stdout: truncatedStdout,
        stderr: truncatedStderr,
      })
    }, timeoutSeconds * 1000)

    // Parse ripgrep JSON for early stopping
    childProcess.stdout.on('data', (chunk: Buffer | string) => {
      if (isResolved) return
      const chunkStr =
        typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      jsonRemainder += chunkStr

      // Split by lines; last line might be partial
      const lines = jsonRemainder.split('\n')
      jsonRemainder = lines.pop() || ''

      for (const line of lines) {
        if (!line) continue
        let evt: any
        try {
          evt = JSON.parse(line)
        } catch {
          continue
        }

        // Process both match and context events
        if (evt.type === 'match' || evt.type === 'context') {
          // Handle both text and bytes for non-UTF8 paths
          const filePath = evt.data.path?.text ?? evt.data.path?.bytes ?? ''
          const lineNumber = evt.data.line_number ?? 0
          // Strip trailing newlines to prevent blank lines in output
          const rawText = evt.data.lines?.text ?? ''
          const lineText = rawText.replace(/\r?\n$/, '')

          // Format as ripgrep output: filename:line_number:content
          const formattedLine = `${filePath}:${lineNumber}:${lineText}`

          // Group by file
          if (!fileGroups.has(filePath)) {
            fileGroups.set(filePath, [])
            fileMatchCounts.set(filePath, 0)
          }
          const fileLines = fileGroups.get(filePath)!
          const fileMatchCount = fileMatchCounts.get(filePath)!

          // Only count matches toward limits, not context lines
          const isMatch = evt.type === 'match'

          // Check if we should include this line
          // For matches: only if we haven't hit the per-file limit
          // For context: always include (they don't count toward limit)
          const shouldInclude = !isMatch || fileMatchCount < maxResults

          if (shouldInclude) {
            // Add the line to output
            fileLines.push(formattedLine)
            estimatedOutputLen += formattedLine.length + 1

            // Only increment match counters for actual matches
            if (isMatch) {
              fileMatchCounts.set(filePath, fileMatchCount + 1)
              matchesGlobal++

              // Check global limit or output size limit
              if (
                matchesGlobal >= globalMaxResults ||
                estimatedOutputLen >= maxOutputStringLength
              ) {
                killedForLimit = true
                hardKill()

                // Build final output from collected matches
                const limitedLines: string[] = []
                for (const lines of fileGroups.values()) {
                  limitedLines.push(...lines)
                }
                const rawOutput = limitedLines.join('\n')
                const formattedOutput = formatCodeSearchOutput(rawOutput)

                const finalOutput =
                  formattedOutput.length > maxOutputStringLength
                    ? formattedOutput.substring(0, maxOutputStringLength) +
                      '\n\n[Output truncated]'
                    : formattedOutput

                const limitReason =
                  matchesGlobal >= globalMaxResults
                    ? `[Global limit of ${globalMaxResults} results reached.]`
                    : '[Output size limit reached.]'

                return settle({
                  stdout: finalOutput + '\n\n' + limitReason,
                  message: `Stopped early after ${matchesGlobal} match(es).`,
                })
              }
            }
          }
        }
      }
    })

    childProcess.stderr.on('data', (chunk: Buffer | string) => {
      if (isResolved) return
      const chunkStr =
        typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      // Keep stderr bounded during streaming
      const limit = Math.floor(maxOutputStringLength / 5)
      if (stderrBuf.length < limit) {
        const space = limit - stderrBuf.length
        stderrBuf += chunkStr.slice(0, space)
      }
    })

    childProcess.once('close', (code) => {
      if (isResolved) return

      // Flush any remaining JSON - handle multiple complete lines
      try {
        if (jsonRemainder) {
          // Ensure we have a trailing newline for split to work correctly
          const maybeMany = jsonRemainder.endsWith('\n')
            ? jsonRemainder
            : jsonRemainder + '\n'
          for (const ln of maybeMany.split('\n')) {
            if (!ln) continue
            try {
              const evt = JSON.parse(ln)
              if (evt?.type === 'match' || evt?.type === 'context') {
                const filePath =
                  evt.data.path?.text ?? evt.data.path?.bytes ?? ''
                const lineNumber = evt.data.line_number ?? 0
                const rawText = evt.data.lines?.text ?? ''
                const lineText = rawText.replace(/\r?\n$/, '')
                const formattedLine = `${filePath}:${lineNumber}:${lineText}`

                if (!fileGroups.has(filePath)) {
                  fileGroups.set(filePath, [])
                  fileMatchCounts.set(filePath, 0)
                }
                const fileLines = fileGroups.get(filePath)!
                const fileMatchCount = fileMatchCounts.get(filePath)!
                const isMatch = evt.type === 'match'

                // Check if we should include this line
                const shouldInclude =
                  !isMatch ||
                  (fileMatchCount < maxResults &&
                    matchesGlobal < globalMaxResults)

                if (shouldInclude) {
                  fileLines.push(formattedLine)

                  // Only increment match counter for actual matches
                  if (isMatch) {
                    fileMatchCounts.set(filePath, fileMatchCount + 1)
                    matchesGlobal++
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}

      // Build final output from collected matches
      const limitedLines: string[] = []
      const truncatedFiles: string[] = []

      for (const [filename, fileLines] of fileGroups) {
        limitedLines.push(...fileLines)
        // Note if file was truncated (based on match count, not total lines)
        const fileMatchCount = fileMatchCounts.get(filename) ?? 0
        if (fileMatchCount >= maxResults) {
          truncatedFiles.push(
            `${filename}: limited to ${maxResults} results per file`,
          )
        }
      }

      let rawOutput = limitedLines.join('\n')

      // Add truncation messages
      const truncationMessages: string[] = []
      if (truncatedFiles.length > 0) {
        truncationMessages.push(
          `Results limited to ${maxResults} per file. Truncated files:\n${truncatedFiles.join('\n')}`,
        )
      }
      if (killedForLimit) {
        truncationMessages.push(
          `Global limit of ${globalMaxResults} results reached.`,
        )
      }

      if (truncationMessages.length > 0) {
        rawOutput += `\n\n[${truncationMessages.join('\n\n')}]`
      }

      const formattedOutput = formatCodeSearchOutput(rawOutput)

      // Truncate output to prevent memory issues
      const truncatedStdout =
        formattedOutput.length > maxOutputStringLength
          ? formattedOutput.substring(0, maxOutputStringLength) +
            '\n\n[Output truncated]'
          : formattedOutput

      const truncatedStderr = stderrBuf
        ? stderrBuf +
          (stderrBuf.length >= Math.floor(maxOutputStringLength / 5)
            ? '\n\n[Error output truncated]'
            : '')
        : ''

      settle({
        stdout: truncatedStdout,
        ...(truncatedStderr && { stderr: truncatedStderr }),
        message:
          code !== null
            ? `Exit code: ${code}${killedForLimit ? ' (early stop)' : ''}`
            : '',
      })
    })

    childProcess.once('error', (error) => {
      if (isResolved) return
      settle({
        errorMessage: `Failed to execute ripgrep: ${error.message}. Vendored ripgrep not found; ensure @codebuff/sdk is up-to-date or set CODEBUFF_RG_PATH.`,
      })
    })
  })
}
