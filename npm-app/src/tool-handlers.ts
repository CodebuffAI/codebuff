import { spawn } from 'child_process'
import * as path from 'path'

import { FileChangeSchema } from '@codebuff/common/actions'
import {
  BrowserActionSchema,
  BrowserResponse,
} from '@codebuff/common/browser-actions'
import { applyChanges } from '@codebuff/common/util/changes'
import { truncateStringWithMessage } from '@codebuff/common/util/string'
import { cyan, green, red, yellow } from 'picocolors'
import { getRgPath } from './native/ripgrep'
import { logger } from './utils/logger'

import { SHOULD_ASK_CONFIG } from '@codebuff/common/constants'
import { ToolCall } from '@codebuff/common/types/session-state'
import { handleBrowserInstruction } from './browser-runner'
import { waitForPreviousCheckpoint } from './cli-handlers/checkpoint'
import { Client } from './client'
import { DiffManager } from './diff-manager'
import { getProjectRoot } from './project-files'
import { runTerminalCommand } from './terminal/run-command'
import { Spinner } from './utils/spinner'
import { scrapeWebPage } from './web-scraper'
import { runFileChangeHooks } from './json-config/hooks'

export type ToolHandler<T extends Record<string, any>> = (
  parameters: T,
  id: string
) => Promise<string | BrowserResponse>

export const handleUpdateFile: ToolHandler<{
  tool: 'write_file' | 'str_replace' | 'create_plan'
  path: string
  content: string
  type: 'patch' | 'file'
}> = async (parameters, _id) => {
  const projectPath = getProjectRoot()
  const fileChange = FileChangeSchema.parse(parameters)
  const lines = fileChange.content.split('\n')

  await waitForPreviousCheckpoint()
  const { created, modified, ignored, invalid } = applyChanges(projectPath, [
    fileChange,
  ])
  DiffManager.addChange(fileChange)

  let result: string[] = []

  for (const file of created) {
    const counts = `(${green(`+${lines.length}`)})`
    result.push(
      `Created ${file} successfully. Changes made:\n${lines.join('\n')}`
    )
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
    result.push(
      `Wrote to ${file} successfully. Changes made:\n${lines.join('\n')}`
    )
    console.log(green(`- Updated ${file} ${counts}`))
  }
  for (const file of ignored) {
    result.push(
      `Failed to write to ${file}; file is ignored by .gitignore or .codebuffignore`
    )
  }
  for (const file of invalid) {
    result.push(
      `Failed to write to ${file}; file path caused an error or file could not be written`
    )
  }
  return result.join('\n')
}

export const handleScrapeWebPage: ToolHandler<{ url: string }> = async (
  parameters
) => {
  const { url } = parameters
  const content = await scrapeWebPage(url)
  if (!content) {
    return `<web_scraping_error url="${url}">Failed to scrape the web page.</web_scraping_error>`
  }
  return `<web_scraped_content url="${url}">${content}</web_scraped_content>`
}

export const handleRunTerminalCommand = async (
  parameters: {
    command: string
    mode?: 'user' | 'assistant'
    process_type?: 'SYNC' | 'BACKGROUND'
    cwd?: string
    timeout_seconds?: number
  },
  id: string
): Promise<{ result: string; stdout: string }> => {
  const {
    command,
    mode = 'assistant',
    process_type = 'SYNC',
    cwd,
    timeout_seconds = 30,
  } = parameters

  await waitForPreviousCheckpoint()
  if (mode === 'assistant' && process_type === 'BACKGROUND') {
    Client.getInstance().oneTimeFlags[SHOULD_ASK_CONFIG] = true
  }

  return runTerminalCommand(
    id,
    command,
    mode,
    process_type.toUpperCase() as 'SYNC' | 'BACKGROUND',
    timeout_seconds,
    cwd
  )
}

export const handleCodeSearch: ToolHandler<{
  pattern: string
  flags?: string
  cwd?: string
}> = async (parameters, _id) => {
  const projectPath = getProjectRoot()
  const rgPath = await getRgPath()

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
        resolve(
          `<terminal_command_error>Invalid cwd: Path '${parameters.cwd}' is outside the project directory.</terminal_command_error>`
        )
        return
      }
      searchCwd = requestedPath
    }
    const args = [...flags, pattern, '.']

    console.log()
    console.log(
      green(
        `Searching ${parameters.cwd ? `${basename}/${parameters.cwd}` : basename} for "${pattern}"${flags.length > 0 ? ` with flags: ${flags.join(' ')}` : ''}:`
      )
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
      const maxResults = 3
      const previewResults = lines.slice(0, maxResults)
      if (previewResults.length > 0) {
        console.log(previewResults.join('\n'))
        if (lines.length > maxResults) {
          console.log('...')
        }
      }
      console.log(green(`Found ${lines.length} results`))

      const truncatedStdout = truncateStringWithMessage({
        str: stdout,
        maxLength: 10000,
      })
      const truncatedStderr = truncateStringWithMessage({
        str: stderr,
        maxLength: 1000,
      })
      resolve(
        formatResult(
          truncatedStdout,
          truncatedStderr,
          'Code search completed',
          code
        )
      )
    })

    childProcess.on('error', (error) => {
      resolve(
        `<terminal_command_error>Failed to execute ripgrep: ${error.message}</terminal_command_error>`
      )
    })
  })
}

function formatResult(
  stdout: string,
  stderr: string | undefined,
  status: string,
  exitCode: number | null
): string {
  let result = '<terminal_command_result>\n'
  result += `<stdout>${stdout}</stdout>\n`
  if (stderr !== undefined) {
    result += `<stderr>${stderr}</stderr>\n`
  }
  result += `<status>${status}</status>\n`
  if (exitCode !== null) {
    result += `<exit_code>${exitCode}</exit_code>\n`
  }
  result += '</terminal_command_result>'
  return result
}

export const toolHandlers: Record<string, ToolHandler<any>> = {
  write_file: handleUpdateFile,
  str_replace: handleUpdateFile,
  create_plan: handleUpdateFile,
  scrape_web_page: handleScrapeWebPage,
  run_terminal_command: ((parameters, id) =>
    handleRunTerminalCommand(parameters, id).then(
      (result) => result.result
    )) as ToolHandler<{
    command: string
    process_type: 'SYNC' | 'BACKGROUND'
  }>,
  code_search: handleCodeSearch,
  end_turn: async () => '',
  run_file_change_hooks: async (parameters: { files: string[] }) => {
    // Wait for any pending file operations to complete
    await waitForPreviousCheckpoint()

    const { toolResults, someHooksFailed } = await runFileChangeHooks(
      parameters.files
    )

    // Format the results for display
    const results = toolResults
      .map((result) => {
        const hookName = result.toolName.replace('file-change-hook-', '')
        return `Hook '${hookName}': ${result.result}`
      })
      .join('\n\n')

    // Add a summary if some hooks failed
    if (someHooksFailed) {
      const finalResult =
        results +
        '\n\n⚠️ Some file change hooks failed. Please review the output above.'
      logger.info(
        { files: parameters.files, resultLength: finalResult.length },
        'Returning file change hooks result with failures'
      )
      return finalResult
    }

    const finalResult =
      results || 'No file change hooks were triggered for the specified files.'
    logger.info(
      { files: parameters.files, resultLength: finalResult.length },
      'Returning successful file change hooks result'
    )
    return finalResult
  },
  browser_logs: async (params, _id): Promise<string> => {
    Spinner.get().start('Using browser...')
    let response: BrowserResponse
    try {
      const action = BrowserActionSchema.parse(params)
      response = await handleBrowserInstruction(action)
    } catch (error) {
      Spinner.get().stop()
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.log('Small hiccup, one sec...')
      logger.error(
        {
          errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined,
          params,
        },
        'Browser action validation failed'
      )
      return JSON.stringify({
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
      })
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
        'Browser action failed'
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
                'Browser tool error'
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

    return JSON.stringify(response)
  },
}

export const handleToolCall = async (toolCall: ToolCall) => {
  const { toolName, args, toolCallId } = toolCall
  const handler = toolHandlers[toolName]
  if (!handler) {
    throw new Error(`No handler found for tool: ${toolName}`)
  }

  const content = await handler(args, toolCallId)

  if (typeof content !== 'string') {
    throw new Error(
      `Tool call ${toolName} not supported. It returned non-string content.`
    )
  }

  // TODO: Add support for screenshots.
  // const toolResultMessage: Message = {
  //   role: 'user',
  //   content: match(content)
  //     .with({ screenshots: P.not(P.nullish) }, (response) => [
  //       ...(response.screenshots.pre ? [response.screenshots.pre] : []),
  //       {
  //         type: 'text' as const,
  //         text:
  //           JSON.stringify({
  //             ...response,
  //             screenshots: undefined,
  //           }),
  //       },
  //       response.screenshots.post,
  //     ])
  //     .with(P.string, (str) => str)
  //     .otherwise((val) => JSON.stringify(val)),
  // }

  return {
    toolName,
    toolCallId,
    result: content,
  }
}
