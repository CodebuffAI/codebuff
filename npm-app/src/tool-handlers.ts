import { spawn } from 'child_process'
import path from 'path'
import { green } from 'picocolors'
import { rgPath } from '@vscode/ripgrep'
import * as os from 'os'

let pty: typeof import('@homebridge/node-pty-prebuilt-multiarch') | undefined
const tempConsoleError = console.error
console.error = () => {}
try {
  pty = require('@homebridge/node-pty-prebuilt-multiarch')
} catch (error) {
} finally {
  console.error = tempConsoleError
}

import { scrapeWebPage } from './web-scraper'
import { getProjectRoot, setProjectRoot } from './project-files'
import { detectShell } from './utils/detect-shell'

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

const createPty = (dir: string) => {
  if (pty) {
    const isWindows = os.platform() === 'win32'
    const currShell = detectShell()
    const shell = isWindows
      ? currShell === 'powershell'
        ? 'powershell.exe'
        : 'cmd.exe'
      : 'bash'
    const persistentPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd: dir,
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
    return { type: 'pty', pty: persistentPty } as const
  } else {
    // Fallback to child_process
    const isWindows = os.platform() === 'win32'
    const currShell = detectShell()
    const shell = isWindows
      ? currShell === 'powershell'
        ? 'powershell.exe'
        : 'cmd.exe'
      : 'bash'
    return { type: 'process', shell } as const
  }
}

let persistentProcess: ReturnType<typeof createPty> | null = null
export const resetPtyShell = (dir: string) => {
  if (persistentProcess) {
    if (persistentProcess.type === 'pty') {
      persistentProcess.pty.kill()
    }
  }
  persistentProcess = createPty(dir)
}

export const handleRunTerminalCommand = async (
  input: { command: string },
  id: string,
  mode: 'user' | 'assistant'
): Promise<{ result: string; stdout: string }> => {
  const { command } = input
  const MAX_EXECUTION_TIME = 10_000

  return new Promise((resolve) => {
    if (!persistentProcess) {
      throw new Error('Shell not initialized')
    }

    if (persistentProcess.type === 'pty') {
      // Use PTY implementation
      const ptyProcess = persistentProcess.pty
      let commandOutput = ''
      let foundFirstNewLine = false

      if (mode === 'assistant') {
        console.log()
        console.log(green(`> ${command}`))
      }

      const timer = setTimeout(() => {
        if (mode === 'assistant') {
          // Kill and recreate PTY
          resetPtyShell(getProjectRoot())

          resolve({
            result: formatResult(
              commandOutput,
              undefined,
              `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds and was terminated. Shell has been restarted.`
            ),
            stdout: commandOutput,
          })
        }
      }, MAX_EXECUTION_TIME)

      const dataDisposable = ptyProcess.onData((data: string) => {
        const prefix = commandOutput + data

        // Skip the first line of the output, because it's the command being printed.
        if (!foundFirstNewLine) {
          if (!prefix.includes('\n')) {
            return
          }

          foundFirstNewLine = true
          const newLineIndex = prefix.indexOf('\n')
          data = prefix.slice(newLineIndex + 1)
        }

        // Try to detect error messages in the output
        if (mode === 'user' && isNotACommand(data)) {
          clearTimeout(timer)
          dataDisposable.dispose()
          resolve({
            result: 'command not found',
            stdout: commandOutput,
          })
          return
        }

        // Detect the end of the command output if the prompt is printed.
        // Windows PowerShell prompt pattern: "MM/DD HH:mm Path ►"
        const simpleWindowsPromptRegex = /\d{2}:\d{2}.*►/
        // Another PowerShell prompt: "PS C:\jahooma\www\Finance-Scraper>"
        const simpleWindowsPromptRegex2 = /PS [A-Z]:\\.*>/
        // Another cmd prompt: "C:\jahooma\www\Finance-Scraper>"
        const simpleWindowsPromptRegex3 = /[A-Z]:\\\S+>/

        const hasSimplePromptOnWindows = simpleWindowsPromptRegex.test(prefix)
        const hasSimplePromptOnWindows2 = simpleWindowsPromptRegex2.test(prefix)
        const hasSimplePromptOnWindows3 = simpleWindowsPromptRegex3.test(prefix)

        const promptDetected = 
          prefix.includes('bash-3.2$ ') ||
          hasSimplePromptOnWindows ||
          hasSimplePromptOnWindows2 ||
          hasSimplePromptOnWindows3

        if (promptDetected) {
          commandOutput += data
          process.stdout.write(data)
          // Add a newline instead of clearing to avoid overwriting
          process.stdout.write('\n')
          clearTimeout(timer)
          dataDisposable.dispose()

          if (command.startsWith('cd ') && mode === 'user') {
            const newWorkingDirectory = command.split(' ')[1]
            setProjectRoot(path.join(getProjectRoot(), newWorkingDirectory))
          }

          if (mode === 'assistant') {
            console.log(green(`Command completed`))
          }

          // Reset the PTY to the project root
          ptyProcess.write(`cd ${getProjectRoot()}\r`)

          resolve({
            result: formatResult(commandOutput, undefined, 'Command completed'),
            stdout: commandOutput,
          })
          return
        }

        process.stdout.write(data)
        commandOutput += data
      })

      // Write the command
      ptyProcess.write(command + '\r')
    } else {
      // Fallback to child_process implementation
      const isWindows = os.platform() === 'win32'
      let commandOutput = ''

      if (mode === 'assistant') {
        console.log()
        console.log(green(`> ${command}`))
      }

      const childProcess = spawn(
        persistentProcess.shell,
        [isWindows ? '/c' : '-c', command],
        {
          cwd: getProjectRoot(),
          env: {
            ...process.env,
            PAGER: 'cat',
            GIT_PAGER: 'cat',
            GIT_TERMINAL_PROMPT: '0',
            LESS: '-FRX',
          },
        }
      )

      const timer = setTimeout(() => {
        childProcess.kill()
        if (mode === 'assistant') {
          resolve({
            result: formatResult(
              commandOutput,
              undefined,
              `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds and was terminated.`
            ),
            stdout: commandOutput,
          })
        }
      }, MAX_EXECUTION_TIME)

      childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString()
        process.stdout.write(output)
        commandOutput += output
      })

      childProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString()

        // Try to detect error messages in the output
        if (mode === 'user' && isNotACommand(output)) {
          clearTimeout(timer)
          childProcess.kill()
          resolve({
            result: 'command not found',
            stdout: commandOutput,
          })
          return
        }

        process.stdout.write(output)
        commandOutput += output
      })

      childProcess.on('close', (code) => {
        clearTimeout(timer)

        if (command.startsWith('cd ') && mode === 'user') {
          const newWorkingDirectory = command.split(' ')[1]
          setProjectRoot(path.join(getProjectRoot(), newWorkingDirectory))
        }

        if (mode === 'assistant') {
          console.log(green(`Command completed`))
        }

        resolve({
          result: formatResult(commandOutput, undefined, `Command completed`),
          stdout: commandOutput,
        })
      })
    }
  })
}

const truncate = (str: string, maxLength: number) => {
  return str.length > maxLength
    ? str.slice(0, maxLength) + '\n[...TRUNCATED_DUE_TO_LENGTH]'
    : str
}

function formatResult(
  stdout: string,
  stderr: string | undefined,
  status?: string,
  exitCode?: number | null
): string {
  let result = '<terminal_command_result>\n'
  result += `<stdout>${truncate(stdout, 10000)}</stdout>\n`
  if (stderr !== undefined) {
    result += `<stderr>${truncate(stderr, 10000)}</stderr>\n`
  }
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

    const pattern = input.pattern.replace(/"/g, '')
    const command = `${path.resolve(rgPath)} "${pattern}" .`
    console.log()
    console.log(green(`Searching project for: ${pattern}`))
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
      console.log(green(`${stdout.split('\n').length - 1} results`))
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

const isNotACommand = (output: string) => {
  return (
    output.includes('command not found') ||
    // Linux
    output.includes(': not found') ||
    // Common
    output.includes('syntax error:') ||
    output.includes('syntax error near unexpected token') ||
    // Linux
    output.includes('Syntax error:') ||
    // Windows
    output.includes('is not recognized as an internal or external command') ||
    output.includes('/bin/sh: -c: line') ||
    output.includes('/bin/sh: line') ||
    output.startsWith('fatal:') ||
    output.startsWith('error:') ||
    output.startsWith('Der Befehl') ||
    output.includes('konnte nicht gefunden werden') ||
    output.includes(
      'wurde nicht als Name eines Cmdlet, einer Funktion, einer Skriptdatei oder eines ausführbaren'
    )
  )
}
