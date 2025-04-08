import assert from 'assert'
import { ChildProcessWithoutNullStreams, execSync, spawn } from 'child_process'
import * as os from 'os'
import path from 'path'

import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import { buildArray } from 'common/util/array'
import { truncateStringWithMessage } from 'common/util/string'
import { green } from 'picocolors'

import {
  backgroundProcesses,
  BackgroundProcessInfo,
} from '../background-process-manager'
import { setProjectRoot } from '../project-files'
import { detectShell } from './detect-shell'

let pty: typeof import('@homebridge/node-pty-prebuilt-multiarch') | undefined
const tempConsoleError = console.error
console.error = () => {}
try {
  pty = require('@homebridge/node-pty-prebuilt-multiarch')
} catch (error) {
} finally {
  console.error = tempConsoleError
}

const COMMAND_OUTPUT_LIMIT = 10_000
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
  result += `<output>${truncateStringWithMessage(stdout, COMMAND_OUTPUT_LIMIT)}</output>\n`
  result += `<status>${status}</status>\n`
  result += '</terminal_command_result>'
  return result
}

const MAX_EXECUTION_TIME = 30_000

const getBackgroundProcessInfoString = (info: BackgroundProcessInfo) => {
  return buildArray([
    '<background_process_info>',
    `<process_id>${info.id}</process_id>`,
    `<command>${info.command}</command>`,
    `<start_time>${info.startTime}</start_time>`,
    `<duration_ms>${info.endTime === null ? Date.now() - info.startTime : info.endTime - info.startTime}</duration_ms>`,
    `</terminal_command_result>`,
    `<status>${info.status}</status>`,
    info.exitCode !== null && `<exit_code>${info.exitCode}</exit_code>`,
    `<stdout>${truncateStringWithMessage(info.stdoutBuffer.join(''), COMMAND_OUTPUT_LIMIT / 2)}</stdout>`,
    `<stderr>${truncateStringWithMessage(info.stderrBuffer.join(''), COMMAND_OUTPUT_LIMIT / 2)}</stderr>`,
    '</terminal_command_result>',
    '</background_process_info>',
  ]).join('\n')
}

const runBackgroundCommand = (
  command: string,
  projectPath: string,
  resolveCommand: (value: { result: string; stdout: string }) => void
) => {
  const isWindows = os.platform() === 'win32'
  const shell = isWindows ? 'cmd.exe' : 'bash'
  const shellArgs = isWindows ? ['/c'] : ['-c']

  console.log(green(`Running background process...\n> ${command}`))

  const initialStdout = ''
  const initialStderr = ''

  try {
    const childProcess = spawn(shell, [...shellArgs, command], {
      cwd: projectPath,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
      // Ensure detached is always false to link child lifetime to parent
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // An error should have been thrown when we called `spawn`
    assert(
      childProcess.pid !== undefined,
      'Failed to spawn process: no PID assigned.'
    )

    const processId = childProcess.pid
    const processInfo: BackgroundProcessInfo = {
      id: processId,
      command: command,
      process: childProcess,
      stdoutBuffer: [],
      stderrBuffer: [],
      status: 'running',
      exitCode: null,
      startTime: Date.now(),
      endTime: null,
    }
    backgroundProcesses.set(processId, processInfo)

    childProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString()
      processInfo.stdoutBuffer.push(output)
    })

    childProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString()
      processInfo.stderrBuffer.push(output)
    })

    childProcess.on('error', (error) => {
      processInfo.status = 'error'
      processInfo.stderrBuffer.push(
        `\nError spawning command: ${error.message}`
      )
      processInfo.endTime = Date.now()
    })

    childProcess.on('close', (code) => {
      processInfo.status = code === 0 ? 'completed' : 'error'
      processInfo.exitCode = code
      processInfo.endTime = Date.now()
    })

    console.log({ pid: childProcess.pid }, 'asdf')
    childProcess.kill()

    // Unreference the process so the parent can exit independently IF the child is the only thing keeping it alive.
    childProcess.unref()

    const resultMessage = `<background_process_started>
<process_id>${processId}</process_id>
<command>${command}</command>
<status>${processInfo.status}</status>
</background_process_started>`
    resolveCommand({
      result: resultMessage,
      stdout: initialStdout + initialStderr,
    })
  } catch (error: any) {
    const errorMessage = `<background_process_failed>\n<command>${command}</command>\n<error>${error.message}</error>\n</background_process_failed>`
    resolveCommand({ result: errorMessage, stdout: error.message })
  }
}

export const runTerminalCommand = async (
  command: string,
  mode: 'user' | 'assistant',
  projectPath: string,
  backgroundProcess: boolean = false
): Promise<{ result: string; stdout: string }> => {
  return new Promise((resolve) => {
    if (!persistentProcess) {
      throw new Error('Shell not initialized')
    }

    if (commandIsRunning) {
      resetShell(projectPath)
    }

    commandIsRunning = true

    // Add special case for git log to limit output
    const modifiedCommand =
      command.trim() === 'git log' ? 'git log -n 5' : command

    const resolveCommand = (value: { result: string; stdout: string }) => {
      commandIsRunning = false
      resolve(value)
    }

    if (backgroundProcess) {
      runBackgroundCommand(modifiedCommand, projectPath, resolveCommand)
    } else if (persistentProcess.type === 'pty') {
      runCommandPty(
        persistentProcess,
        modifiedCommand,
        mode,
        resolveCommand,
        projectPath
      )
    } else {
      // Fallback to child_process implementation
      runCommandChildProcess(
        persistentProcess,
        modifiedCommand,
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
    // `clear` needs access to the main process stdout. This is a workaround.
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
