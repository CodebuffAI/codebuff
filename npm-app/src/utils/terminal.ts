import { spawn } from 'child_process'
import path from 'path'
import { green } from 'picocolors'
import * as os from 'os'
import { detectShell } from './detect-shell'
import { getProjectRoot, setProjectRoot } from 'src/project-files'
import { truncateStringWithMessage } from 'common/util/string'

let pty: typeof import('@homebridge/node-pty-prebuilt-multiarch') | undefined
const tempConsoleError = console.error
console.error = () => {}
try {
  pty = require('@homebridge/node-pty-prebuilt-multiarch')
} catch (error) {
} finally {
  console.error = tempConsoleError
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

function formatResult(stdout: string, status: string): string {
  let result = '<terminal_command_result>\n'
  result += `<output>${truncateStringWithMessage(stdout, 10000)}</output>\n`
  result += `<status>${status}</status>\n`
  result += '</terminal_command_result>'
  return result
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

export const runTerminalCommand = async (
  command: string,
  mode: 'user' | 'assistant'
): Promise<{ result: string; stdout: string }> => {
  const MAX_EXECUTION_TIME = 10_000

  const projectRoot = getProjectRoot()

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
          resetPtyShell(projectRoot)

          resolve({
            result: formatResult(
              commandOutput,
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
          clearTimeout(timer)
          dataDisposable.dispose()

          if (command.startsWith('cd ') && mode === 'user') {
            const newWorkingDirectory = command.split(' ')[1]
            setProjectRoot(path.join(projectRoot, newWorkingDirectory))
          }

          if (mode === 'assistant') {
            console.log(green(`Command completed`))
          }

          // Reset the PTY to the project root
          ptyProcess.write(`cd ${projectRoot}\r`)

          resolve({
            result: formatResult(commandOutput, 'Command completed'),
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
          cwd: projectRoot,
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
          setProjectRoot(path.join(projectRoot, newWorkingDirectory))
        }

        if (mode === 'assistant') {
          console.log(green(`Command completed`))
        }

        resolve({
          result: formatResult(commandOutput, `Command completed`),
          stdout: commandOutput,
        })
      })
    }
  })
}
