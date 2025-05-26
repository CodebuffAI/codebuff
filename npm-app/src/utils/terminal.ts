import assert from 'assert'
import { ChildProcessWithoutNullStreams, execSync, spawn } from 'child_process'
import { createWriteStream, mkdirSync, WriteStream } from 'fs'
import * as os from 'os'
import path, { dirname } from 'path'

import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { buildArray } from 'common/util/array'
import { stripColors, truncateStringWithMessage } from 'common/util/string'
import { green } from 'picocolors'

import {
  backgroundProcesses,
  BackgroundProcessInfo,
  spawnAndTrack,
} from '../background-process-manager'
import {
  getProjectRoot,
  getWorkingDirectory,
  isSubdir,
  setWorkingDirectory,
} from '../project-files'
import { trackEvent } from './analytics'
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
      // Source all relevant config files based on shell type
      if (currShell === 'zsh') {
        shellInitCommands = `
          source ~/.zshenv 2>/dev/null || true
          source ~/.zprofile 2>/dev/null || true
          source ~/.zshrc 2>/dev/null || true
          source ~/.zlogin 2>/dev/null || true
        `
      } else if (currShell === 'fish') {
        shellInitCommands = `
          source ~/.config/fish/config.fish 2>/dev/null || true
        `
      } else {
        // Bash - source both profile and rc files
        shellInitCommands = `
          source ~/.bash_profile 2>/dev/null || true
          source ~/.profile 2>/dev/null || true
          source ~/.bashrc 2>/dev/null || true
        `
      }
    } else if (currShell === 'powershell') {
      // Try to source all possible PowerShell profile locations
      shellInitCommands = `
        $profiles = @(
          $PROFILE.AllUsersAllHosts,
          $PROFILE.AllUsersCurrentHost,
          $PROFILE.CurrentUserAllHosts,
          $PROFILE.CurrentUserCurrentHost
        )
        foreach ($prof in $profiles) {
          if (Test-Path $prof) { . $prof }
        }
      `
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
              ANSICON: '1',
              PROMPT: promptIdentifier,
            }
          : {
              TERM: 'xterm-256color',
              // Preserve important environment variables
              PATH: process.env.PATH,
              HOME: process.env.HOME,
              USER: process.env.USER,
              SHELL: shellWithoutExe,
            }),
        LESS: '-FRX',
        TERM_PROGRAM: 'mintty',
        FORCE_COLOR: '1',
        // Locale settings for consistent output
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
      },
    })

    // Source the shell config files
    if (shellInitCommands) {
      persistentPty.write(shellInitCommands)
    }

    // Set prompt for Unix shells after sourcing config
    if (!isWindows) {
      persistentPty.write(
        `PS1=${promptIdentifier} && PS2=${promptIdentifier}\n`
      )
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

export let persistentProcess: ReturnType<
  typeof createPersistantProcess
> | null = null

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

export const recreateShell = (cwd: string) => {
  persistentProcess = createPersistantProcess(cwd)
}

export const resetShell = (cwd: string) => {
  commandIsRunning = false
  if (persistentProcess) {
    if (persistentProcess.timerId) {
      clearTimeout(persistentProcess.timerId)
      persistentProcess.timerId = null
    }

    if (persistentProcess.type === 'pty') {
      persistentProcess.pty.kill()
      recreateShell(cwd)
    } else {
      persistentProcess.childProcess?.kill()
      persistentProcess = {
        ...persistentProcess,
        childProcess: null,
      }
    }
  }
}

function formatResult(command: string, stdout: string, status: string): string {
  return buildArray(
    `<command>${command}</command>`,
    '<terminal_command_result>',
    `<output>${truncateStringWithMessage({ str: stdout, maxLength: COMMAND_OUTPUT_LIMIT, remove: 'MIDDLE' })}</output>`,
    `<status>${status}</status>`,
    '</terminal_command_result>'
  ).join('\n')
}

const MAX_EXECUTION_TIME = 30_000

export function runBackgroundCommand(
  options: {
    toolCallId: string
    command: string
    mode: 'user' | 'assistant'
    cwd: string
    stdoutFile?: string
    stderrFile?: string
  },
  resolveCommand: (value: {
    result: string
    stdout: string
    exitCode: number | null
  }) => void
): void {
  const { toolCallId, command, mode, cwd, stdoutFile, stderrFile } = options
  const isWindows = os.platform() === 'win32'
  const shell = isWindows ? 'cmd.exe' : 'bash'
  const shellArgs = isWindows ? ['/c'] : ['-c']

  if (mode === 'assistant') {
    console.log(green(`Running background process...\n> ${command}`))
  }

  const initialStdout = ''
  const initialStderr = ''

  try {
    const childProcess = spawnAndTrack(shell, [...shellArgs, command], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
      // Ensure detached is always false to link child lifetime to parent
      detached: false,
      stdio: 'pipe',
    })

    // An error should have been thrown when we called `spawn`
    assert(
      childProcess.pid !== undefined,
      'Failed to spawn process: no PID assigned.'
    )

    const processId = childProcess.pid
    const processInfo: BackgroundProcessInfo = {
      pid: processId,
      toolCallId,
      command,
      process: childProcess,
      stdoutBuffer: [],
      stderrBuffer: [],
      status: 'running',
      startTime: Date.now(),
      endTime: null,
      lastReportedStdoutLength: 0,
      lastReportedStderrLength: 0,
      lastReportedStatus: null,
      stdoutFile,
      stderrFile,
    }
    backgroundProcesses.set(processId, processInfo)

    // Set up file streams if paths are provided
    let stdoutStream: WriteStream | undefined
    let stderrStream: WriteStream | undefined

    if (stdoutFile) {
      const stdoutAbs = path.isAbsolute(stdoutFile)
        ? stdoutFile
        : path.join(cwd, stdoutFile)
      mkdirSync(dirname(stdoutAbs), { recursive: true })
      stdoutStream = createWriteStream(stdoutAbs)
    }

    const realStderrFile = stderrFile || stdoutFile
    if (realStderrFile) {
      const stderrAbs = path.isAbsolute(realStderrFile)
        ? realStderrFile
        : path.join(cwd, realStderrFile)
      mkdirSync(dirname(stderrAbs), { recursive: true })
      stderrStream = createWriteStream(stderrAbs)
    }

    childProcess.stdout.on('data', (data: Buffer) => {
      const output = stripColors(data.toString())
      processInfo.stdoutBuffer.push(output)

      // Write to file if stream exists
      if (stdoutStream) {
        stdoutStream.write(output)
      }
    })

    childProcess.stderr.on('data', (data: Buffer) => {
      const output = stripColors(data.toString())
      processInfo.stderrBuffer.push(output)

      // Write to file if stream exists
      if (stderrStream) {
        stderrStream.write(output)
      }
    })

    childProcess.on('error', (error) => {
      processInfo.status = 'error'
      processInfo.stderrBuffer.push(
        `\nError spawning command: ${error.message}`
      )
      processInfo.endTime = Date.now()

      // Close file streams
      stdoutStream?.end()
      stderrStream?.end()
    })

    let exitCode = null

    childProcess.on('close', (code) => {
      exitCode = code
      processInfo.status = code === 0 ? 'completed' : 'error'
      processInfo.endTime = Date.now()

      // Close file streams
      stdoutStream?.end()
      stderrStream?.end()
    })

    // Unreference the process so the parent can exit independently IF the child is the only thing keeping it alive.
    childProcess.unref()

    const resultMessage = `<background_process>
<process_id>${processId}</process_id>
<command>${command}</command>
<status>${processInfo.status}</status>
</background_process>`
    resolveCommand({
      result: resultMessage,
      stdout: initialStdout + initialStderr,
      exitCode,
    })
  } catch (error: any) {
    const errorMessage = `<background_process>\n<command>${command}</command>\n<error>${error.message}</error>\n</background_process>`
    resolveCommand({
      result: errorMessage,
      stdout: error.message,
      exitCode: null,
    })
  }
}

export const runTerminalCommand = async (
  toolCallId: string,
  command: string,
  mode: 'user' | 'assistant',
  processType: 'SYNC' | 'BACKGROUND',
  timeoutSeconds: number,
  cwd?: string,
  stdoutFile?: string,
  stderrFile?: string
): Promise<{ result: string; stdout: string }> => {
  const maybeTimeoutSeconds = timeoutSeconds < 0 ? null : timeoutSeconds
  cwd = cwd || (mode === 'assistant' ? getProjectRoot() : getWorkingDirectory())
  return new Promise((resolve) => {
    if (!persistentProcess) {
      throw new Error('Shell not initialized')
    }

    if (commandIsRunning) {
      resetShell(cwd)
    }

    commandIsRunning = true

    // Add special case for git log to limit output
    const modifiedCommand =
      command.trim() === 'git log' ? 'git log -n 5' : command

    const resolveCommand = (value: {
      result: string
      stdout: string
      exitCode: number | null
    }) => {
      commandIsRunning = false
      trackEvent(AnalyticsEvent.TERMINAL_COMMAND_COMPLETED, {
        command,
        result: value.result,
        stdout: value.stdout,
        exitCode: value.exitCode,
        mode,
        processType,
      })
      resolve(value)
    }

    if (processType === 'BACKGROUND') {
      runBackgroundCommand(
        {
          toolCallId,
          command: modifiedCommand,
          mode,
          cwd,
          stdoutFile,
          stderrFile,
        },
        resolveCommand
      )
    } else if (persistentProcess.type === 'pty') {
      runCommandPty(
        persistentProcess,
        modifiedCommand,
        mode,
        cwd,
        maybeTimeoutSeconds,
        resolveCommand
      )
    } else {
      // Fallback to child_process implementation
      runCommandChildProcess(
        persistentProcess,
        modifiedCommand,
        mode,
        cwd,
        maybeTimeoutSeconds,
        resolveCommand
      )
    }
  })
}

const echoLinePattern = new RegExp(`${promptIdentifier}[^\n]*\n`, 'g')
const commandDonePattern = new RegExp(
  `^${promptIdentifier}(.*)${promptIdentifier}[\\s\\S]*${promptIdentifier}`
)
export const runCommandPty = (
  persistentProcess: PersistentProcess & {
    type: 'pty'
  },
  command: string,
  mode: 'user' | 'assistant',
  cwd: string,
  maybeTimeoutSeconds: number | null,
  resolve: (value: {
    result: string
    stdout: string
    exitCode: number | null
  }) => void
) => {
  const ptyProcess = persistentProcess.pty

  if (command.trim() === 'clear') {
    // `clear` needs access to the main process stdout. This is a workaround.
    execSync('clear', { stdio: 'inherit' })
    resolve({
      result: formatResult(command, '', `Complete`),
      stdout: '',
      exitCode: 0,
    })
    return
  }

  const projectRoot = getProjectRoot()
  const isWindows = os.platform() === 'win32'
  if (mode === 'assistant') {
    const displayDirectory = path.join(
      path.parse(projectRoot).base,
      path.relative(projectRoot, path.resolve(projectRoot, cwd))
    )
    console.log(green(`${displayDirectory} > ${command}`))
  }

  let commandOutput = ''
  let buffer = promptIdentifier
  let echoLinesRemaining = isWindows ? 1 : command.split('\n').length

  let timer: NodeJS.Timeout | null = null
  if (maybeTimeoutSeconds !== null) {
    timer = setTimeout(() => {
      if (mode === 'assistant') {
        // Kill and recreate PTY
        resetShell(cwd)

        resolve({
          result: formatResult(
            command,
            commandOutput,
            `Command timed out after ${maybeTimeoutSeconds} seconds and was terminated. Shell has been restarted.`
          ),
          stdout: commandOutput,
          exitCode: 124,
        })
      }
    }, maybeTimeoutSeconds * 1000)
  }

  persistentProcess.timerId = timer

  const longestSuffixThatsPrefixOf = (str: string, target: string): string => {
    for (let len = target.length; len > 0; len--) {
      const prefix = target.slice(0, len)
      if (str.endsWith(prefix)) {
        return prefix
      }
    }

    return ''
  }

  const dataDisposable = ptyProcess.onData((data: string) => {
    buffer += data
    const suffix = longestSuffixThatsPrefixOf(buffer, promptIdentifier)
    let toProcess = buffer.slice(0, buffer.length - suffix.length)
    buffer = suffix

    const matches = toProcess.match(echoLinePattern)
    if (matches) {
      for (let i = 0; i < matches.length && echoLinesRemaining > 0; i++) {
        echoLinesRemaining = Math.max(echoLinesRemaining - 1, 0)
        // Process normal output line
        toProcess = toProcess.replace(echoLinePattern, '')
      }
    }

    const indexOfPromptIdentifier = toProcess.indexOf(promptIdentifier)
    if (indexOfPromptIdentifier !== -1) {
      buffer = toProcess.slice(indexOfPromptIdentifier) + buffer
      toProcess = toProcess.slice(0, indexOfPromptIdentifier)
    }

    process.stdout.write(toProcess)
    commandOutput += toProcess

    const commandDone = buffer.match(commandDonePattern)
    if (commandDone && echoLinesRemaining === 0) {
      // Command is done
      if (timer) {
        clearTimeout(timer)
      }
      dataDisposable.dispose()

      const exitCode = buffer.includes('Command completed')
        ? 0
        : (() => {
            const match = buffer.match(/Command failed with exit code (\d+)\./)
            return match ? parseInt(match[1]) : null
          })()
      const statusMessage = buffer.includes('Command completed')
        ? 'Complete'
        : `Failed with exit code: ${exitCode}`

      const newWorkingDirectory = commandDone[1]
      if (mode === 'assistant') {
        ptyProcess.write(`cd ${getWorkingDirectory()}\r\n`)

        resolve({
          result: formatResult(
            command,
            commandOutput,
            `cwd: ${path.resolve(projectRoot, cwd)}\n\n${statusMessage}`
          ),
          stdout: commandOutput,
          exitCode,
        })
        return
      }

      let outsideProject = false
      const currentWorkingDirectory = getWorkingDirectory()
      let finalCwd = currentWorkingDirectory
      if (newWorkingDirectory !== currentWorkingDirectory) {
        trackEvent(AnalyticsEvent.CHANGE_DIRECTORY, {
          from: currentWorkingDirectory,
          to: newWorkingDirectory,
          isSubdir: isSubdir(currentWorkingDirectory, newWorkingDirectory),
        })
        if (path.relative(projectRoot, newWorkingDirectory).startsWith('..')) {
          outsideProject = true
          console.log(`
Unable to cd outside of the project root (${projectRoot})
      
If you want to change the project root:
1. Exit Codebuff (type "exit")
2. Navigate into the target directory (type "cd ${newWorkingDirectory}")
3. Restart Codebuff`)
          ptyProcess.write(`cd ${currentWorkingDirectory}\r\n`)
        } else {
          setWorkingDirectory(newWorkingDirectory)
          finalCwd = newWorkingDirectory
        }
      }

      resolve({
        result: formatResult(
          command,
          commandOutput,
          buildArray([
            `cwd: ${currentWorkingDirectory}`,
            `${statusMessage}\n`,
            outsideProject &&
              `Detected final cwd outside project root. Reset cwd to ${currentWorkingDirectory}`,
            `Final **user** cwd: ${finalCwd} (Assistant's cwd is still project root)`,
          ]).join('\n')
        ),
        stdout: commandOutput,
        exitCode,
      })
      return
    }
  })

  // Write the command
  const cdCommand = `cd ${path.resolve(projectRoot, cwd)}`
  const commandWithCheck = isWindows
    ? `${cdCommand} & ${command} & echo ${promptIdentifier}%cd%${promptIdentifier}`
    : `${cdCommand}; ${command}; ec=$?; printf "${promptIdentifier}$(pwd)${promptIdentifier}"; if [ $ec -eq 0 ]; then printf "Command completed."; else printf "Command failed with exit code $ec."; fi`
  ptyProcess.write(`${commandWithCheck}\r`)
}

const runCommandChildProcess = (
  persistentProcess: ReturnType<typeof createPersistantProcess> & {
    type: 'process'
  },
  command: string,
  mode: 'user' | 'assistant',
  cwd: string,
  maybeTimeoutSeconds: number | null,
  resolve: (value: {
    result: string
    stdout: string
    exitCode: number | null
  }) => void
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
      cwd,
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

  let timer: NodeJS.Timeout | null = null
  if (maybeTimeoutSeconds !== null) {
    timer = setTimeout(() => {
      resetShell(cwd)
      if (mode === 'assistant') {
        resolve({
          result: formatResult(
            command,
            commandOutput,
            `Command timed out after ${maybeTimeoutSeconds} seconds and was terminated.`
          ),
          stdout: commandOutput,
          exitCode: 124,
        })
      }
    }, maybeTimeoutSeconds * 1000)
  }

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
    if (timer) {
      clearTimeout(timer)
    }

    if (command.startsWith('cd ') && mode === 'user') {
      const newWorkingDirectory = command.split(' ')[1]
      cwd = setWorkingDirectory(path.join(cwd, newWorkingDirectory))
    }

    if (mode === 'assistant') {
      console.log(green(`Command completed`))
    }

    resolve({
      result: formatResult(command, commandOutput, `complete`),
      stdout: commandOutput,
      exitCode: childProcess.exitCode,
    })
  })
}

export function killAndResetPersistentProcess() {
  if (persistentProcess?.type === 'pty') {
    persistentProcess.pty.kill()
    persistentProcess = null
  }
}

export function clearScreen() {
  process.stdout.write('\u001b[2J\u001b[0;0H')
}
