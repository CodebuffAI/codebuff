import { ChildProcessWithoutNullStreams, execSync, spawn } from 'child_process'
import * as os from 'os'
import path from 'path'

import type { IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { buildArray } from 'common/util/array'
import {
  stripColors,
  suffixPrefixOverlap,
  truncateStringWithMessage,
} from 'common/util/string'
import { green } from 'picocolors'

import {
  getProjectRoot,
  getWorkingDirectory,
  isSubdir,
  setWorkingDirectory,
} from '../project-files'
import { trackEvent } from '../utils/analytics'
import { detectShell } from '../utils/detect-shell'
import { logger } from '../utils/logger'
import { runBackgroundCommand } from './background'

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
const needleIdentifier = '@76593@'

type PersistentProcess =
  | {
      type: 'pty'
      shell: 'cmd.exe' | 'powershell.exe' | 'bash'
      pty: IPty
      timerId: NodeJS.Timeout | null
      // Add persistent output buffer for manager mode
      globalOutputBuffer: string
      globalOutputLastReadLength: number
    }
  | {
      type: 'process'
      shell: 'bash' | 'cmd.exe' | 'powershell.exe'
      childProcess: ChildProcessWithoutNullStreams | null
      timerId: NodeJS.Timeout | null
      // Add persistent output buffer for manager mode
      globalOutputBuffer: string
      globalOutputLastReadLength: number
    }

const createPersistantProcess = (
  dir: string,
  forceChildProcess = false
): PersistentProcess => {
  if (pty && process.env.NODE_ENV !== 'test' && !forceChildProcess) {
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

    const persistentProcessInfo: PersistentProcess = {
      type: 'pty',
      shell,
      pty: persistentPty,
      timerId: null,
      globalOutputBuffer: '',
      globalOutputLastReadLength: 0,
    }

    // Add a persistent listener to capture all output for manager mode
    persistentPty.onData((data: string) => {
      if (persistentProcessInfo.type === 'pty') {
        persistentProcessInfo.globalOutputBuffer += data.toString() // Should we use stripColors(...)?
      }
    })

    return persistentProcessInfo
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
      globalOutputBuffer: '',
      globalOutputLastReadLength: 0,
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

export const recreateShell = (cwd: string, forceChildProcess = false) => {
  persistentProcess = createPersistantProcess(cwd, forceChildProcess)
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

function formatResult(
  command: string,
  stdout: string | undefined,
  status: string
): string {
  return buildArray(
    `<command>${command}</command>`,
    '<terminal_command_result>',
    stdout &&
      `<output>${truncateStringWithMessage({ str: stripColors(stdout), maxLength: COMMAND_OUTPUT_LIMIT, remove: 'MIDDLE' })}</output>`,
    `<status>${status}</status>`,
    '</terminal_command_result>'
  ).join('\n')
}

export const runTerminalCommand = async (
  toolCallId: string,
  command: string,
  mode: 'user' | 'assistant' | 'manager',
  processType: 'SYNC' | 'BACKGROUND',
  timeoutSeconds: number,
  cwd?: string,
  stdoutFile?: string,
  stderrFile?: string
): Promise<{ result: string; stdout: string; exitCode: number | null }> => {
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
      if (mode === 'manager') {
        runCommandPtyManager(
          persistentProcess,
          modifiedCommand,
          cwd,
          maybeTimeoutSeconds,
          resolveCommand
        )
      } else {
        runCommandPty(
          persistentProcess,
          modifiedCommand,
          mode,
          cwd,
          maybeTimeoutSeconds,
          resolveCommand
        )
      }
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
const getNeedlePatternCache: Record<string, RegExp> = {}
function getNeedlePattern(middlePattern: string = '.*'): RegExp {
  if (!(middlePattern in getNeedlePatternCache)) {
    getNeedlePatternCache[middlePattern] = new RegExp(
      `${needleIdentifier}(${middlePattern})${needleIdentifier}`
    )
  }
  return getNeedlePatternCache[middlePattern]
}
/**
 * Executes a single command in a PTY process and returns the result when complete.
 *
 * This function handles the low-level details of running a command in a pseudo-terminal,
 * including parsing the output to separate command echoes from actual output, detecting
 * command completion
 *
 * @param ptyProcess - The IPty instance to execute the command in
 * @param command - The shell command to execute
 * @param onChunk - Callback function called for each chunk of output as it's received
 *
 * @returns Promise that resolves with:
 *   - The complete output from the command (excluding echo lines)
 *
 * @example
 * ```typescript
 * const result = await runSinglePtyCommand(
 *   ptyProcess,
 *   'ls -la',
 *   process.stdout.write
 * );
 * ```
 *
 * @internal This is a low-level utility function used by other terminal command runners.
 * It handles platform-specific differences between Windows and Unix-like systems.
 *
 * The function works by:
 * 1. Setting up a data listener on the PTY process
 * 2. Filtering out command echo lines (the command being typed)
 * 3. Detecting command completion markers (promptIdentifier)
 */
function runSinglePtyCommand(
  ptyProcess: IPty,
  command: string,
  onChunk: (data: string) => void
): Promise<string> {
  const isWindows = os.platform() === 'win32'
  let commandOutput = ''
  let buffer = promptIdentifier
  let echoLinesRemaining = isWindows ? 1 : command.split('\n').length

  const resultPromise = new Promise<string>((resolve) => {
    const dataDisposable = ptyProcess.onData((data: string) => {
      buffer += data

      // Wait for pending promptIdentifier
      const suffix = suffixPrefixOverlap(buffer, promptIdentifier)
      let toProcess = buffer.slice(0, buffer.length - suffix.length)
      buffer = suffix

      // Remove echo lines from the output
      const matches = toProcess.match(echoLinePattern)
      if (matches) {
        for (let i = 0; i < matches.length && echoLinesRemaining > 0; i++) {
          echoLinesRemaining = Math.max(echoLinesRemaining - 1, 0)
          toProcess = toProcess.replace(echoLinePattern, '')
        }
      }

      // Do not process anything after a promptIdentifier (pending line)
      const promptIdentifierIndex = toProcess.indexOf(promptIdentifier)
      if (promptIdentifierIndex !== -1) {
        buffer = toProcess.slice(promptIdentifierIndex) + buffer
        toProcess = toProcess.slice(0, promptIdentifierIndex)
      }

      onChunk(toProcess)
      commandOutput += toProcess

      const commandDone = buffer.startsWith(promptIdentifier)
      if (commandDone && echoLinesRemaining === 0) {
        // Command is done
        dataDisposable.dispose()

        resolve(commandOutput)
      }
    })
  })

  // Write the command
  ptyProcess.write(`${command}\r`)

  return resultPromise
}

export const runCommandPty = (
  persistentProcess: PersistentProcess & {
    type: 'pty'
  },
  command: string,
  mode: 'user' | 'assistant' | 'manager',
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

  new Promise(async () => {
    await runSinglePtyCommand(ptyProcess, `cd ${cwd}`, () => {})

    await runSinglePtyCommand(ptyProcess, command, (data: string) => {
      commandOutput += data
      process.stdout.write(data)
    })

    const exitCodeHaystack = await runSinglePtyCommand(
      ptyProcess,
      persistentProcess.shell === 'cmd.exe'
        ? `echo ${needleIdentifier}%ERRORLEVEL%${needleIdentifier}`
        : `echo ${needleIdentifier}$?${needleIdentifier}`,
      () => {}
    )
    let exitCode: number | null = null
    const exitCodeMatch = exitCodeHaystack.match(getNeedlePattern('\\d+'))
    if (exitCodeMatch) {
      exitCode = parseInt(exitCodeMatch[1].trim())
    } else {
      logger.error({ exitCodeHaystack }, 'Could not find exitCode in output')
    }

    const cwdHaystack = await runSinglePtyCommand(
      ptyProcess,
      isWindows
        ? `echo ${needleIdentifier}%cd%${needleIdentifier}`
        : `echo ${needleIdentifier}$(pwd)${needleIdentifier}`,
      () => {}
    )
    const m = cwdHaystack.match(getNeedlePattern())
    let newWorkingDirectory
    if (m) {
      newWorkingDirectory = m[1].trim()
    } else {
      logger.error({ cwdHaystack }, 'Could not find cwd in output')
      newWorkingDirectory = cwd
    }

    const statusMessage =
      exitCode === null
        ? ''
        : exitCode === 0
          ? 'Complete'
          : `Failed with exit code: ${exitCode}`

    if (timer) {
      clearTimeout(timer)
    }

    if (mode === 'assistant') {
      await runSinglePtyCommand(
        ptyProcess,
        `cd ${getWorkingDirectory()}`,
        () => {}
      )

      resolve({
        result: formatResult(
          command,
          commandOutput,
          buildArray([
            `cwd: ${path.resolve(projectRoot, cwd)}`,
            statusMessage,
          ]).join('\n\n')
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
        await runSinglePtyCommand(
          ptyProcess,
          `cd ${currentWorkingDirectory}`,
          () => {}
        )
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
  })
}

const runCommandChildProcess = (
  persistentProcess: ReturnType<typeof createPersistantProcess> & {
    type: 'process'
  },
  command: string,
  mode: 'user' | 'assistant' | 'manager',
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

// New function specifically for manager mode with settling behavior
export const runCommandPtyManager = (
  persistentProcess: PersistentProcess & {
    type: 'pty'
  },
  command: string,
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

  console.log(green(`${cwd} > ${command}`))

  let commandOutput = ''
  let buffer = promptIdentifier
  let echoLinesRemaining = isWindows ? 1 : command.split('\n').length

  let timer: NodeJS.Timeout | null = null
  let settleTimer: NodeJS.Timeout | null = null

  // Use the provided timeout or default to 30 seconds for manager mode
  const managerTimeoutMs =
    maybeTimeoutSeconds !== null ? maybeTimeoutSeconds * 1000 : 30000

  if (maybeTimeoutSeconds !== null) {
    timer = setTimeout(() => {
      // In manager mode, don't kill the terminal - just report what we have
      if (timer) {
        clearTimeout(timer)
      }
      if (settleTimer) {
        clearTimeout(settleTimer)
      }
      dataDisposable.dispose()

      resolve({
        result: formatResult(
          command,
          commandOutput,
          `Command timed out after ${managerTimeoutMs / 1000} seconds. Output captured so far. Terminal is still running.`
        ),
        stdout: commandOutput,
        exitCode: null, // null indicates timeout, not failure
      })
    }, managerTimeoutMs)
  }

  persistentProcess.timerId = timer

  const finishCommand = (exitCode: number | null = null) => {
    if (timer) {
      clearTimeout(timer)
    }
    if (settleTimer) {
      clearTimeout(settleTimer)
    }
    dataDisposable.dispose()

    const statusMessage =
      exitCode === 0
        ? 'Complete'
        : exitCode === null
          ? 'Comand started'
          : `Failed with exit code: ${exitCode}`

    resolve({
      result: formatResult(
        command,
        undefined,
        `cwd: ${path.resolve(projectRoot, cwd)}\n\n${statusMessage}`
      ),
      stdout: commandOutput,
      exitCode,
    })
  }

  const dataDisposable = ptyProcess.onData((data: string) => {
    buffer += data
    const suffix = suffixPrefixOverlap(buffer, promptIdentifier)
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

    // Reset settle timer whenever we get new output
    if (settleTimer) {
      clearTimeout(settleTimer)
    }

    // Set settle timer for 3000ms - if no new output comes, finish the command
    settleTimer = setTimeout(() => {
      finishCommand()
    }, 3000)

    const commandDone = buffer.startsWith(promptIdentifier)
    if (commandDone && echoLinesRemaining === 0) {
      // Command is done
      const exitCode = buffer.includes('Command completed')
        ? 0
        : (() => {
            const match = buffer.match(/Command failed with exit code (\d+)\./)
            return match ? parseInt(match[1]) : null
          })()

      finishCommand(exitCode)
      return
    }
  })

  ptyProcess.write(`${command}`)
  setTimeout(() => {
    ptyProcess.write('\r')
  }, 50)
}

// Add a function to get new terminal output since last read
export const readNewTerminalOutput = (
  options: {
    maxLength: number
  } = { maxLength: COMMAND_OUTPUT_LIMIT }
): string => {
  if (!persistentProcess) {
    return ''
  }

  const currentLength = persistentProcess.globalOutputBuffer.length
  const newOutput = persistentProcess.globalOutputBuffer.slice(
    persistentProcess.globalOutputLastReadLength
  )

  // Update the last read position
  persistentProcess.globalOutputLastReadLength = currentLength

  return truncateStringWithMessage({
    str: newOutput,
    maxLength: options.maxLength,
    remove: 'MIDDLE',
  })
}
