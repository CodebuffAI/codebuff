import { ChildProcessWithoutNullStreams, execSync, spawn } from 'child_process'
import path from 'path'
import { green } from 'picocolors'
import * as os from 'os'
import { detectShell } from './detect-shell'
import { setProjectRoot } from '../project-files'
import { truncateStringWithMessage } from 'common/util/string'
import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'

let pty: typeof import('@homebridge/node-pty-prebuilt-multiarch') | undefined
const tempConsoleError = console.error
console.error = () => {}
try {
  pty = require('@homebridge/node-pty-prebuilt-multiarch')
} catch (error) {
} finally {
  console.error = tempConsoleError
}

const promptIdentifier = '@36261@'

type PersistentProcess =
  | {
      type: 'pty'
      shell: 'pty'
      pty: IPty
      timerId: NodeJS.Timeout | null
    }
  | {
      type: 'process'
      shell: 'bash' | 'cmd.exe' | 'powershell.exe'
      childProcess: ChildProcessWithoutNullStreams | null
      timerId: NodeJS.Timeout | null
    }

const createPersistantProcess = (dir: string): PersistentProcess => {
  if (pty && process.env.NODE_ENV !== 'test') {
    const isWindows = os.platform() === 'win32'
    const currShell = detectShell()
    const shell = isWindows
      ? currShell === 'powershell'
        ? 'powershell.exe'
        : 'cmd.exe'
      : 'bash'

    const shellWithoutExe = shell.split('.')[0]

    // Prepare shell init commands
    let shellInitCommands = ''
    if (!isWindows) {
      const rcFile =
        currShell === 'zsh'
          ? '~/.zshrc'
          : currShell === 'fish'
            ? '~/.config/fish/config.fish'
            : '~/.bashrc'
      shellInitCommands = `source ${rcFile} 2>/dev/null || true\n`
    } else if (currShell === 'powershell') {
      // Try to source PowerShell profile if it exists
      shellInitCommands =
        '$PSProfile = $PROFILE.CurrentUserAllHosts; if (Test-Path $PSProfile) { . $PSProfile }\n'
    }

    const persistentPty = pty.spawn(shell, isWindows ? [] : ['--login'], {
      name: 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd: dir,
      env: {
        ...process.env,
        PAGER: 'cat',
        GIT_PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        ...(isWindows
          ? {
              TERM: 'cygwin',
              ANSICON: '1', // Better ANSI support in cmd.exe
              PROMPT: promptIdentifier,
            }
          : {
              TERM: 'xterm-256color',
            }),
        LESS: '-FRX',
        TERM_PROGRAM: 'mintty',
        FORCE_COLOR: '1', // Enable colors in CI/CD
        // Locale settings for consistent output
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        // Shell-specific settings
        SHELL: shellWithoutExe,
      },
    })

    // Source the shell config file if available
    if (shellInitCommands) {
      persistentPty.write(shellInitCommands)
    }
    // Set prompt for Unix shells after sourcing config
    if (!isWindows) {
      persistentPty.write(`PS1='${promptIdentifier}'\n`)
    }

    return { type: 'pty', shell: 'pty', pty: persistentPty, timerId: null }
  } else {
    // Fallback to child_process
    const isWindows = os.platform() === 'win32'
    const currShell = detectShell()
    const shell = isWindows
      ? currShell === 'powershell'
        ? 'powershell.exe'
        : 'cmd.exe'
      : 'bash'
    const childProcess = null as ChildProcessWithoutNullStreams | null
    return {
      type: 'process',
      shell,
      childProcess,
      timerId: null,
    }
  }
}

let persistentProcess: ReturnType<typeof createPersistantProcess> | null = null

process.stdout.on('resize', () => {
  if (!persistentProcess) return
  if (persistentProcess.type === 'pty') {
    persistentProcess.pty.resize(process.stdout.columns, process.stdout.rows)
  }
})

let commandIsRunning = false

export const isCommandRunning = () => {
  return commandIsRunning
}

export const recreateShell = (projectPath: string) => {
  persistentProcess = createPersistantProcess(projectPath)
}

export const resetShell = (projectPath: string) => {
  commandIsRunning = false
  if (persistentProcess) {
    if (persistentProcess.timerId) {
      clearTimeout(persistentProcess.timerId)
      persistentProcess.timerId = null
    }

    if (persistentProcess.type === 'pty') {
      persistentProcess.pty.kill()
      recreateShell(projectPath)
    } else {
      persistentProcess.childProcess?.kill()
      persistentProcess = {
        ...persistentProcess,
        childProcess: null,
      }
    }
  }
}

function formatResult(stdout: string, status: string): string {
  let result = '<terminal_command_result>\n'
  result += `<output>${truncateStringWithMessage(stdout, 10000)}</output>\n`
  result += `<status>${status}</status>\n`
  result += '</terminal_command_result>'
  return result
}

const MAX_EXECUTION_TIME = 30_000

export const runTerminalCommand = async (
  command: string,
  mode: 'user' | 'assistant',
  projectPath: string
): Promise<{ result: string; stdout: string }> => {
  return new Promise((resolve) => {
    if (!persistentProcess) {
      throw new Error('Shell not initialized')
    }

    if (commandIsRunning) {
      resetShell(projectPath)
    }

    commandIsRunning = true

    const resolveCommand = (value: { result: string; stdout: string }) => {
      commandIsRunning = false
      resolve(value)
    }

    if (persistentProcess.type === 'pty') {
      runCommandPty(
        persistentProcess,
        command,
        mode,
        resolveCommand,
        projectPath
      )
    } else {
      // Fallback to child_process implementation
      runCommandChildProcess(
        persistentProcess,
        command,
        mode,
        resolveCommand,
        projectPath
      )
    }
  })
}

export const runCommandPty = (
  persistentProcess: PersistentProcess & {
    type: 'pty'
  },
  command: string,
  mode: 'user' | 'assistant',
  resolve: (value: { result: string; stdout: string }) => void,
  projectPath: string
) => {
  const ptyProcess = persistentProcess.pty
  let commandOutput = ''
  let pendingOutput = ''
  let foundFirstNewLine = false

  if (mode === 'assistant') {
    console.log()
    console.log(green(`> ${command}`))
  }

  const timer = setTimeout(() => {
    if (mode === 'assistant') {
      // Kill and recreate PTY
      resetShell(projectPath)

      resolve({
        result: formatResult(
          commandOutput,
          `Command timed out after ${MAX_EXECUTION_TIME / 1000} seconds and was terminated. Shell has been restarted.`
        ),
        stdout: commandOutput,
      })
    }
  }, MAX_EXECUTION_TIME)

  persistentProcess.timerId = timer

  const dataDisposable = ptyProcess.onData((data: string) => {
    // Trim first line if it's the prompt identifier
    if (
      (commandOutput + pendingOutput).trim() === '' &&
      data.trimStart().startsWith(promptIdentifier)
    ) {
      data = data.trimStart().slice(promptIdentifier.length)
    }

    const prefix = commandOutput + pendingOutput + data

    // Skip the first line of the output, because it's the command being printed.
    if (!foundFirstNewLine) {
      if (!prefix.includes('\n')) {
        return
      }

      foundFirstNewLine = true
      const newLineIndex = prefix.indexOf('\n')
      data = prefix.slice(newLineIndex + 1)
    }

    const dataLines = (pendingOutput + data).split('\r\n')
    for (const [index, l] of dataLines.entries()) {
      const isLast = index === dataLines.length - 1
      const line = isLast ? l : l + '\r\n'

      if (line.includes(promptIdentifier)) {
        // Last line is the prompt, command is done
        clearTimeout(timer)
        dataDisposable.dispose()

        if (command.startsWith('cd ') && mode === 'user') {
          const newWorkingDirectory = command.split(' ')[1]
          projectPath = setProjectRoot(
            path.join(projectPath, newWorkingDirectory)
          )
        }

        // Reset the PTY to the project root
        ptyProcess.write(`cd ${projectPath}\r`)

        resolve({
          result: formatResult(commandOutput, 'Command completed'),
          stdout: commandOutput,
        })
        return
      } else if (isLast) {
        // Doesn't end in newline character, wait for more data
        pendingOutput = line
      } else {
        // Process the line
        process.stdout.write(line)
        commandOutput += line
      }
    }
  })

  const isWindows = os.platform() === 'win32'

  if (command.trim() === 'clear') {
    // NOTE: node-pty doesn't seem to clear the terminal. This is a workaround.
    execSync('clear', { stdio: 'inherit' })
  }

  // Write the command
  const commandWithCheck = isWindows
    ? command
    : `${command}; ec=$?; if [ $ec -eq 0 ]; then printf "Command completed. "; else printf "Command failed with exit code $ec. "; fi`
  ptyProcess.write(commandWithCheck + '\r')
}

const runCommandChildProcess = (
  persistentProcess: ReturnType<typeof createPersistantProcess> & {
    type: 'process'
  },
  command: string,
  mode: 'user' | 'assistant',
  resolve: (value: { result: string; stdout: string }) => void,
  projectPath: string
) => {
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
      cwd: projectPath,
      env: {
        ...process.env,
        PAGER: 'cat',
        GIT_PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        LESS: '-FRX',
      },
    }
  )
  persistentProcess = {
    ...persistentProcess,
    childProcess,
  }

  const timer = setTimeout(() => {
    resetShell(projectPath)
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

  persistentProcess.timerId = timer

  childProcess.stdout.on('data', (data: Buffer) => {
    const output = data.toString()
    process.stdout.write(output)
    commandOutput += output
  })

  childProcess.stderr.on('data', (data: Buffer) => {
    const output = data.toString()

    process.stdout.write(output)
    commandOutput += output
  })

  childProcess.on('close', (code) => {
    clearTimeout(timer)

    if (command.startsWith('cd ') && mode === 'user') {
      const newWorkingDirectory = command.split(' ')[1]
      projectPath = setProjectRoot(path.join(projectPath, newWorkingDirectory))
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
