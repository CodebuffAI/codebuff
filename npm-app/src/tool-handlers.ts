import { spawn } from 'child_process'
import * as path from 'path'

import { rgPath } from '@vscode/ripgrep'
import { FileChangeSchema } from 'common/actions'
import { BrowserActionSchema, BrowserResponse } from 'common/browser-actions'
import { RawToolCall } from 'common/types/tools'
import { applyChanges } from 'common/util/changes'
import { truncateStringWithMessage } from 'common/util/string'
import { cyan, green, red, yellow } from 'picocolors'

import { handleBrowserInstruction } from './browser-runner'
import { Spinner } from './utils/spinner'
import { runTerminalCommand } from './utils/terminal'
import { scrapeWebPage } from './web-scraper'

export type ToolHandler<T extends Record<string, any>> = (
  parameters: T,
  id: string,
  projectPath: string
) => Promise<string | BrowserResponse>

export const handleWriteFile: ToolHandler<{
  path: string
  content: string
  type: 'patch' | 'file'
}> = async (parameters, _id, projectPath) => {
  const fileChange = FileChangeSchema.parse(parameters)
  const { created, modified } = applyChanges(projectPath, [fileChange])
  let result = ''
  for (const file of created) {
    result += `Wrote to ${file} successfully.\n`
    console.log(green(`- Created ${file}`))
  }
  for (const file of modified) {
    result += `Wrote to ${file} successfully.\n`
    console.log(green(`- Updated ${file}`))
  }
  return result
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
    process_type: 'SYNC' | 'BACKGROUND'
  },
  id: string,
  projectPath: string
): Promise<{ result: string; stdout: string }> => {
  const { command, mode = 'assistant', process_type = 'SYNC' } = parameters
  return runTerminalCommand(
    id,
    command,
    mode,
    projectPath,
    process_type.toUpperCase() as 'SYNC' | 'BACKGROUND'
  )
}

export const handleCodeSearch: ToolHandler<{ pattern: string }> = async (
  parameters,
  _id,
  projectPath
) => {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const basename = path.basename(projectPath)
    const pattern = parameters.pattern.replace(/"/g, '')
    const command = `${path.resolve(rgPath)} "${pattern}" .`
    console.log()
    console.log(green(`Searching ${basename} for "${pattern}":`))
    const childProcess = spawn(command, {
      cwd: projectPath,
      shell: true,
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
  write_file: handleWriteFile,
  scrape_web_page: handleScrapeWebPage,
  run_terminal_command: ((parameters, id, projectPath) =>
    handleRunTerminalCommand(parameters, id, projectPath).then(
      (result) => result.result
    )) as ToolHandler<{
    command: string
    process_type: 'SYNC' | 'BACKGROUND'
  }>,
  code_search: handleCodeSearch,
  end_turn: async () => {
    return ''
  },
  browser_action: async (params, _id): Promise<string> => {
    Spinner.get().start()
    let response: BrowserResponse
    try {
      const action = BrowserActionSchema.parse(params)
      response = await handleBrowserInstruction(action)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.log('Small hiccup, one sec...')
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
    }
    if (response.logs) {
      response.logs.forEach((log) => {
        if (log.source === 'tool') {
          switch (log.type) {
            case 'error':
              console.error(red(log.message))
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

export const handleToolCall = async (
  toolCall: RawToolCall,
  projectPath: string
) => {
  const { name, parameters } = toolCall
  const handler = toolHandlers[name]
  if (!handler) {
    throw new Error(`No handler found for tool: ${name}`)
  }

  const content = await handler(parameters, toolCall.id, projectPath)

  if (typeof content !== 'string') {
    throw new Error(
      `Tool call ${name} not supported. It returned non-string content.`
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
    name,
    result: content,
    id: toolCall.id,
  }
}
