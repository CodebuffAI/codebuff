import { rgPath } from '@vscode/ripgrep'
import { green, red, yellow, blue } from 'picocolors'
import { spawn } from 'child_process'
import { BrowserActionSchema } from 'common/browser-actions'
import { handleBrowserInstruction } from './browser-runner'
import { scrapeWebPage } from './web-scraper'
import { getProjectRoot } from './project-files'
import { runTerminalCommand } from './utils/terminal'
import { truncateStringWithMessage } from 'common/util/string'
import * as path from 'path'

export type ToolHandler = (input: any, id: string) => Promise<string>

export const handleScrapeWebPage: ToolHandler = async (
  input: { url: string },
  id: string
) => {
  const { url } = input
  const content = await scrapeWebPage(url)
  if (!content) {
    return `<web_scraping_error url="${url}">Failed to scrape the web page.</web_scraping_error>`
  }
  return `<web_scraped_content url="${url}">${content}</web_scraped_content>`
}

export const handleRunTerminalCommand = async (
  input: { command: string },
  id: string,
  mode: 'user' | 'assistant'
): Promise<{ result: string; stdout: string }> => {
  const { command } = input
  return runTerminalCommand(command, mode)
}

export const handleCodeSearch: ToolHandler = async (
  input: { pattern: string },
  id: string
) => {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const dir = getProjectRoot()
    const basename = path.basename(dir)
    const pattern = input.pattern.replace(/"/g, '')
    const command = `${path.resolve(rgPath)} "${pattern}" .`
    console.log()
    console.log(green(`Searching ${basename} for "${pattern}":`))
    const childProcess = spawn(command, {
      cwd: dir,
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
      console.log(green(`Found ${lines.length} results\n`))

      const truncatedStdout = truncateStringWithMessage(stdout, 10000)
      const truncatedStderr = truncateStringWithMessage(stderr, 1000)
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

export const toolHandlers: Record<string, ToolHandler> = {
  scrape_web_page: handleScrapeWebPage,
  run_terminal_command: ((input, id) =>
    handleRunTerminalCommand(input, id, 'assistant').then(
      (result) => result.result
    )) as ToolHandler,
  continue: async (input, id) => input.response ?? 'Please continue',
  code_search: handleCodeSearch,
  browser_action: async (input, _id) => {
    const action = BrowserActionSchema.parse(input)
    console.log('Executing browser action:', action)

    const response = await handleBrowserInstruction(action)

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
              console.info(log.message)
              break
            default:
              console.log(log.message)
          }
        }
      })
    }

    // Handle chunked screenshots
    if (response.chunks && response.chunks.length > 0) {
      const sortedChunks = response.chunks.sort((a, b) => a.index - b.index)
      const combinedBase64 = sortedChunks.map((ch) => ch.data).join('')
      response.screenshot = combinedBase64
      delete response.chunks // Remove chunks after combining
    }

    // Send the full response including screenshot
    return JSON.stringify(response)
  },
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

export { handleBrowserInstruction } from './browser-runner'
