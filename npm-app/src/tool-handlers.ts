import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { FileChangeSchema } from '@codebuff/common/actions'
import { BrowserActionSchema } from '@codebuff/common/browser-actions'
import { SHOULD_ASK_CONFIG } from '@codebuff/common/old-constants'
import {
  flattenTree,
  getProjectFileTree,
} from '@codebuff/common/project-file-tree'
import { truncateStringWithMessage } from '@codebuff/common/util/string'
import { formatCodeSearchOutput } from '@codebuff/common/util/format-code-search'
import micromatch from 'micromatch'
import { cyan, green, red, yellow } from 'picocolors'

import { handleBrowserInstruction } from './browser-runner'
import { waitForPreviousCheckpoint } from './cli-handlers/checkpoint'
import { Client } from './client'
import { DiffManager } from './diff-manager'
import { runFileChangeHooks } from './json-config/hooks'
import { getRgPath } from './native/ripgrep'
import { getProjectRoot } from './project-files'
import { runTerminalCommand } from './terminal/run-command'
import { applyChanges } from './utils/changes'
import { logger } from './utils/logger'
import { Spinner } from './utils/spinner'

import type { BrowserResponse } from '@codebuff/common/browser-actions'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { ToolCall } from '@codebuff/common/types/session-state'

export type ToolHandler<T extends ClientToolName> = (
  parameters: ClientToolCall<T>['input'],
  id: string,
) => Promise<CodebuffToolOutput<T>>

export const handleUpdateFile = async <
  T extends 'write_file' | 'str_replace' | 'create_plan',
>(
  parameters: ClientToolCall<T>['input'],
  _id: string,
): Promise<CodebuffToolOutput<T>> => {
  const projectPath = getProjectRoot()
  const fileChange = FileChangeSchema.parse(parameters)
  const lines = fileChange.content.split('\n')

  await waitForPreviousCheckpoint()
  const { created, modified, ignored, invalid, patchFailed } = applyChanges(
    projectPath,
    [fileChange],
  )
  DiffManager.addChange(fileChange)

  let result: CodebuffToolOutput<T>[] = []

  for (const file of created) {
    const counts = `(${green(`+${lines.length}`)})`
    result.push([
      {
        type: 'json',
        value: {
          file,
          message: 'Created new file',
          unifiedDiff: lines.join('\n'),
        },
      },
    ])
    console.log(green(`- Created ${file} ${counts}`))
  }
  for (const file of modified) {
    // Calculate added/deleted lines from the diff content
    let addedLines = 0
    let deletedLines = 0

    lines.forEach((line) => {
      if (line.startsWith('+')) {
        addedLines++
      } else if (line.startsWith('-')) {
        deletedLines++
      }
    })

    const counts = `(${green(`+${addedLines}`)}, ${red(`-${deletedLines}`)})`
    result.push([
      {
        type: 'json',
        value: {
          file,
          message: 'Updated file',
          unifiedDiff: lines.join('\n'),
        },
      },
    ])
    console.log(green(`- Updated ${file} ${counts}`))
  }
  for (const file of ignored) {
    result.push([
      {
        type: 'json',
        value: {
          file,
          errorMessage:
            'Failed to write to file: file is ignored by .gitignore or .codebuffignore',
        },
      },
    ])
  }
  for (const file of patchFailed) {
    result.push([
      {
        type: 'json',
        value: {
          file,
          errorMessage: `Failed to apply patch.`,
          patch: lines.join('\n'),
        },
      },
    ])
  }
  for (const file of invalid) {
    result.push([
      {
        type: 'json',
        value: {
          file,
          errorMessage: `Failed to write to file: File path caused an error or file could not be written`,
        },
      },
    ])
  }

  if (result.length !== 1) {
    throw new Error(
      `Internal error: Unexpected number of matching results for ${{ parameters }}, found ${result.length}, expected 1`,
    )
  }

  return result[0]
}

export const handleRunTerminalCommand: ToolHandler<
  'run_terminal_command'
> = async (
  parameters: {
    command: string
    mode?: 'user' | 'assistant'
    process_type?: 'SYNC' | 'BACKGROUND'
    cwd?: string
    timeout_seconds?: number
  },
  id: string,
): Promise<CodebuffToolOutput<'run_terminal_command'>> => {
  const {
    command,
    mode = 'assistant',
    process_type = 'SYNC',
    cwd,
    timeout_seconds = 30,
  } = parameters

  await waitForPreviousCheckpoint()
  if (mode === 'assistant' && process_type === 'BACKGROUND') {
    const client = Client.getInstance()
    client.oneTimeFlags[SHOULD_ASK_CONFIG] = true
  }

  return await runTerminalCommand(
    id,
    command,
    mode,
    process_type.toUpperCase() as 'SYNC' | 'BACKGROUND',
    timeout_seconds,
    cwd,
  )
}

export const handleListDirectory: ToolHandler<'list_directory'> = async (
  parameters,
  _id,
) => {
  const projectPath = getProjectRoot()
  const directoryPath = parameters.path

  try {
    const resolvedPath = path.resolve(projectPath, directoryPath)

    if (!resolvedPath.startsWith(projectPath)) {
      return [
        {
          type: 'json',
          value: {
            errorMessage: `Invalid path: Path '${directoryPath}' is outside the project directory.`,
          },
        },
      ]
    }

    const dirEntries = await import('fs').then((fs) =>
      fs.promises.readdir(resolvedPath, { withFileTypes: true }),
    )

    const files: string[] = []
    const directories: string[] = []

    for (const entry of dirEntries) {
      if (entry.isDirectory()) {
        directories.push(entry.name)
      } else if (entry.isFile()) {
        files.push(entry.name)
      }
    }

    console.log(
      green(
        `Listing directory ${directoryPath === '.' ? path.basename(projectPath) : directoryPath}: found ${files.length} files and ${directories.length} directories`,
      ),
    )
    console.log()

    return [
      {
        type: 'json',
        value: {
          files,
          directories,
          path: directoryPath,
        },
      },
    ]
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(red(`Failed to list directory: ${errorMessage}`))
    return [
      {
        type: 'json',
        value: {
          errorMessage: `Failed to list directory: ${errorMessage}`,
        },
      },
    ]
  }
}

export const handleCodeSearch: ToolHandler<'code_search'> = async (
  parameters,
  _id,
) => {
  const projectPath = getProjectRoot()
  const rgPath = await getRgPath()
  const maxResults = parameters.maxResults ?? 15
  const globalMaxResults = 250

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const basename = path.basename(projectPath)
    const pattern = parameters.pattern

    const flags = (parameters.flags || '').split(' ').filter(Boolean)
    let searchCwd = projectPath
    if (parameters.cwd) {
      const requestedPath = path.resolve(projectPath, parameters.cwd)
      // Ensure the search path is within the project directory
      if (!requestedPath.startsWith(projectPath)) {
        resolve([
          {
            type: 'json',
            value: {
              errorMessage: `Invalid cwd: Path '${parameters.cwd}' is outside the project directory.`,
            },
          },
        ])
        return
      }
      searchCwd = requestedPath
    }
    // Always include -n flag to ensure line numbers are in output for parsing
    const args = ['-n', ...flags, pattern, '.']

    console.log()
    console.log(
      green(
        `Searching ${parameters.cwd ? `${basename}/${parameters.cwd}` : basename} for "${pattern}"${flags.length > 0 ? ` with flags: ${flags.join(' ')}` : ''}:`,
      ),
    )

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
      let skippedFileCount = 0

      for (const [filename, fileLines] of fileGroups) {
        totalOriginalCount += fileLines.length

        // Check if we've hit the global limit
        if (totalLimitedCount >= globalMaxResults) {
          globalLimitReached = true
          skippedFileCount++
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

      const previewResults = limitedLines.slice(0, 3).join('\n')
      if (previewResults) {
        const formattedPreview = formatCodeSearchOutput(previewResults)
        console.log(formattedPreview)
        if (limitedLines.length > 3) {
          console.log('...')
        }
      }

      const filesIncluded = fileGroups.size - skippedFileCount
      console.log(
        green(
          `Found ${totalLimitedCount} results across ${filesIncluded} file(s)${totalOriginalCount > totalLimitedCount ? ` (limited from ${totalOriginalCount})` : ''}`,
        ),
      )

      // Limit results to maxResults per file and globalMaxResults total
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
          `Global limit of ${globalMaxResults} results reached. ${skippedFileCount} file(s) skipped.`,
        )
      }

      if (truncationMessages.length > 0) {
        limitedStdout += `\n\n[${truncationMessages.join('\n\n')}]`
      }

      const finalStdout = formatCodeSearchOutput(limitedStdout)

      const truncatedStdout = truncateStringWithMessage({
        str: finalStdout,
        maxLength: 10000,
      })
      const truncatedStderr = truncateStringWithMessage({
        str: stderr,
        maxLength: 1000,
      })
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
            errorMessage: `Failed to execute ripgrep: ${error.message}`,
          },
        },
      ])
    })
  })
}

const handleFileChangeHooks: ToolHandler<
  'run_file_change_hooks'
> = async (parameters: { files: string[] }) => {
  // Wait for any pending file operations to complete
  await waitForPreviousCheckpoint()

  const { toolResults, someHooksFailed } = await runFileChangeHooks(
    parameters.files,
  )

  // Add a summary if some hooks failed
  if (someHooksFailed) {
    toolResults[0].value.push({
      errorMessage:
        'Some file change hooks failed. Please review the output above.',
    })
  }

  if (toolResults[0].value.length === 0) {
    toolResults[0].value.push({
      errorMessage:
        'No file change hooks were triggered for the specified files.',
    })
  }

  return toolResults
}

const handleGlob: ToolHandler<'glob'> = async (parameters, _id) => {
  const projectPath = getProjectRoot()
  const { pattern, cwd } = parameters

  try {
    // Get all files in the project
    const fileTree = getProjectFileTree({ projectRoot: projectPath, fs })
    const flattenedNodes = flattenTree(fileTree)
    let allFilePaths = flattenedNodes
      .filter((node) => node.type === 'file')
      .map((node) => node.filePath)

    // Filter by cwd if provided
    if (cwd) {
      const cwdPrefix = cwd.endsWith('/') ? cwd : `${cwd}/`
      allFilePaths = allFilePaths.filter(
        (filePath) =>
          filePath === cwd ||
          filePath.startsWith(cwdPrefix) ||
          filePath === cwd.replace(/\/$/, ''),
      )
    }

    // Use micromatch to filter files by the glob pattern
    const matchingFiles = micromatch(allFilePaths, pattern)

    const basename = path.basename(projectPath)
    console.log()
    console.log(
      green(
        `Searching for pattern "${pattern}"${cwd ? ` in ${basename}/${cwd}` : ` in ${basename}`}: found ${matchingFiles.length} file(s)`,
      ),
    )
    console.log()

    return [
      {
        type: 'json',
        value: {
          files: matchingFiles,
          count: matchingFiles.length,
          message: `Found ${matchingFiles.length} file(s) matching pattern "${pattern}"${cwd ? ` in directory "${cwd}"` : ''}`,
        },
      },
    ]
  } catch (error) {
    return [
      {
        type: 'json',
        value: {
          errorMessage: `Failed to search for files: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
    ]
  }
}

const handleBrowserLogs: ToolHandler<'browser_logs'> = async (params, _id) => {
  Spinner.get().start('Using browser...')
  let response: BrowserResponse
  try {
    const action = BrowserActionSchema.parse(params)
    response = await handleBrowserInstruction(action)
  } catch (error) {
    Spinner.get().stop()
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.log('Small hiccup, one sec...')
    logger.error(
      {
        errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
        params,
      },
      'Browser action validation failed',
    )
    return [
      {
        type: 'json',
        value: {
          success: false,
          error: `Browser action validation failed: ${errorMessage}`,
          logs: [
            {
              type: 'error',
              message: `Browser action validation failed: ${errorMessage}`,
              timestamp: Date.now(),
              source: 'tool',
            },
          ],
        },
      },
    ] satisfies CodebuffToolOutput<'browser_logs'>
  } finally {
    Spinner.get().stop()
  }

  // Log any browser errors
  if (!response.success && response.error) {
    console.error(red(`Browser action failed: ${response.error}`))
    logger.error(
      {
        errorMessage: response.error,
      },
      'Browser action failed',
    )
  }
  if (response.logs) {
    response.logs.forEach((log) => {
      if (log.source === 'tool') {
        switch (log.type) {
          case 'error':
            console.error(red(log.message))
            logger.error(
              {
                errorMessage: log.message,
              },
              'Browser tool error',
            )
            break
          case 'warning':
            console.warn(yellow(log.message))
            break
          case 'info':
            console.info(cyan(log.message))
            break
          default:
            console.log(cyan(log.message))
        }
      }
    })
  }

  return [
    {
      type: 'json',
      value: response,
    },
  ] satisfies CodebuffToolOutput<'browser_logs'>
}

export const toolHandlers: {
  [T in ClientToolName]: ToolHandler<T>
} = {
  write_file: handleUpdateFile,
  str_replace: handleUpdateFile,
  create_plan: handleUpdateFile,
  run_terminal_command: handleRunTerminalCommand,
  code_search: handleCodeSearch,
  glob: handleGlob,
  list_directory: handleListDirectory,
  run_file_change_hooks: handleFileChangeHooks,
  browser_logs: handleBrowserLogs,
}

export const handleToolCall = async (
  toolCall: ToolCall,
): Promise<ToolResultPart> => {
  const { toolName, input, toolCallId } = toolCall
  const handler = toolHandlers[toolName as ClientToolName]
  if (!handler) {
    throw new Error(`No handler found for tool: ${toolName}`)
  }

  const content = await handler(input as any, toolCallId)

  const contentArray = Array.isArray(content) ? content : [content]
  return {
    type: 'tool-result',
    toolName,
    toolCallId,
    output: contentArray,
  } satisfies ToolResultPart
}
