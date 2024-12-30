import { spawn } from 'child_process'
import path from 'path'
import { green } from 'picocolors'
import { rgPath } from '@vscode/ripgrep'
import * as os from 'os'
import * as pty from 'node-pty'

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

export const initializePty = () => {
  const isWindows = os.platform() === 'win32'
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'
  const persistentPty = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    cwd: getProjectRoot(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      PAGER: 'cat',
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      ...(isWindows ? { TERM: 'cygwin' } : {}),
      LESS: '-FRX',
      TERM_PROGRAM: 'mintty',
    },
  })
  persistentPty.write(`cd ${getProjectRoot()}\r`)
  return persistentPty
}

export let persistentPty = initializePty()

export const handleRunTerminalCommand = async (
  input: { command: string },
  id: string,
  mode: 'user' | 'assistant'
): Promise<{ result: string; stdout: string; stderr: string }> => {
  // Note: With PTY, all output comes through stdout since it emulates a real terminal
  const { command } = input
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = '' // Kept for API compatibility, but PTY combines all output
    const MAX_EXECUTION_TIME = 10_000

    if (mode === 'assistant') {
      console.log()
      console.log(green(`> ${command}`))
    }

    const ptyProcess = persistentPty

    const timer = setTimeout(() => {
      if (mode === 'assistant') {
        // Kill the existing PTY
        ptyProcess.kill()
        
        // Create a new PTY instance
        persistentPty = initializePty()
        
        resolve({
          result: formatResult(
            stdout,
            stderr,
            `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds and was terminated. Shell has been restarted.`
          ),
          stdout,
          stderr,
        })
      }
    }, MAX_EXECUTION_TIME)

    let commandOutput = ''

    const dataDisposable = ptyProcess.onData((data: string) => {
      // Shell prompt means command is complete
      if (data.includes('bash-3.2$ ')) {
        clearTimeout(timer)
        dataDisposable.dispose()

        if (command.startsWith('cd ') && mode === 'user') {
          const newWorkingDirectory = command.split(' ')[1]
          setProjectRoot(path.join(getProjectRoot(), newWorkingDirectory))
        }

        resolve({
          result: formatResult(commandOutput, stderr, 'Command completed', 0),
          stdout: commandOutput,
          stderr,
        })
        if (mode === 'assistant') {
          console.log(green(`Command finished with exit code: 0\n`))
        }
        return
      }

      // Skip command echo
      if (data === `${command}\r\n`) return

      // Process command output
      process.stdout.write(data)
      commandOutput += data

      // Try to detect error messages in the output
      if (
        mode === 'user' &&
        (data.includes('command not found') ||
          data.includes(': not found') ||
          data.includes('syntax error:') ||
          data.includes('Syntax error:') ||
          data.includes(
            'is not recognized as an internal or external command'
          ) ||
          data.includes('/bin/sh: -c: line') ||
          data.includes('/bin/sh: line') ||
          data.startsWith('fatal:') ||
          data.startsWith('error:'))
      ) {
        clearTimeout(timer)
        dataDisposable.dispose()
        resolve({
          result: 'command not found',
          stdout: commandOutput,
          stderr: '',
        })
      }
    })

    // Write the command
    ptyProcess.write(command + '\r')
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
