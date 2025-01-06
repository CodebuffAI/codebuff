import { spawn } from 'child_process'
import path from 'path'
import { green } from 'picocolors'
import { rgPath } from '@vscode/ripgrep'

import { scrapeWebPage } from './web-scraper'
import { getProjectRoot, setProjectRoot } from './project-files'

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
): Promise<{ result: string; stdout: string; stderr: string }> => {
  const { command } = input
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const MAX_EXECUTION_TIME = 10_000

    if (mode === 'assistant') {
      console.log()
      console.log(green(`> ${command}`))
    }
    const childProcess = spawn(command, {
      shell: true,
      cwd: getProjectRoot(),
    })

    const timer = setTimeout(() => {
      if (mode === 'assistant') {
        childProcess.kill()
        resolve({
          result: formatResult(
            stdout,
            stderr,
            `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds. Partial results shown.`
          ),
          stdout,
          stderr,
        })
      }
    }, MAX_EXECUTION_TIME)

    childProcess.stdout.on('data', (data) => {
      process.stdout.write(data.toString())
      stdout += data.toString()
    })

    childProcess.stderr.on('data', (data) => {
      const dataStr = data.toString()
      stderr += data.toString()
      if (
        mode === 'user' &&
        // Mac
        (dataStr.includes('command not found') ||
          // Linux
          dataStr.includes(': not found') ||
          // Common
          dataStr.includes('syntax error:') ||
          // Linux
          dataStr.includes('Syntax error:') ||
          // Windows
          dataStr.includes(
            'is not recognized as an internal or external command'
          ) ||
          dataStr.includes('/bin/sh: -c: line') ||
          dataStr.includes('/bin/sh: line') ||
          dataStr.startsWith('fatal:') ||
          dataStr.startsWith('error:') ||
          dataStr.startsWith('Der Befehl') ||
          dataStr.includes(
            'ist entweder falsch geschrieben oder konnte nicht gefunden werden'
          ))
      ) {
        resolve({
          result: 'command not found',
          stdout,
          stderr,
        })
      } else {
        process.stderr.write(data.toString())
      }
    })

    childProcess.on('close', (code) => {
      if (command.startsWith('cd ') && code === 0 && mode === 'user') {
        const newWorkingDirectory = command.split(' ')[1]
        setProjectRoot(path.join(getProjectRoot(), newWorkingDirectory))
      }

      clearTimeout(timer)
      resolve({
        result: formatResult(stdout, stderr, 'Command completed', code),
        stdout,
        stderr,
      })
      if (mode === 'assistant') {
        console.log(green(`Command finished with exit code: ${code}\n`))
      }
    })

    childProcess.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        result: `<terminal_command_error>Failed to execute command: ${error.message}</terminal_command_error>`,
        stdout,
        stderr,
      })
    })
  })
}

const truncate = (str: string, maxLength: number) => {
  return str.length > maxLength
    ? str.slice(0, maxLength) + '\n[...TRUNCATED_DUE_TO_LENGTH]'
    : str
}

function formatResult(
  stdout: string,
  stderr: string,
  status?: string,
  exitCode?: number | null
): string {
  let result = '<terminal_command_result>\n'
  result += `<stdout>${truncate(stdout, 10000)}</stdout>\n`
  result += `<stderr>${truncate(stderr, 10000)}</stderr>\n`
  if (status !== undefined) {
    result += `<status>${status}</status>\n`
  }
  if (exitCode !== undefined && exitCode !== null) {
    result += `<exit_code>${exitCode}</exit_code>\n`
  }
  result += '</terminal_command_result>'
  return result
}

export const handleCodeSearch: ToolHandler = async (
  input: { pattern: string },
  id: string
) => {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    const command = `${path.resolve(rgPath)} ${input.pattern} .`
    console.log()
    console.log(green(`Searching project for: ${input.pattern}`))
    const childProcess = spawn(command, {
      cwd: getProjectRoot(),
      shell: true,
    })

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    childProcess.on('close', (code) => {
      console.log()
      const truncatedStdout = truncate(stdout, 10000)
      const truncatedStderr = truncate(stderr, 1000)
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
}
