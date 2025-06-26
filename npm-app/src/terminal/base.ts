import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import * as os from 'os'
import path from 'path'
import { green } from 'picocolors'

import { loadBunPty } from '../native/pty'
type IPty = ReturnType<
  NonNullable<Awaited<ReturnType<typeof loadBunPty>>>['spawn']
>
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { buildArray } from '@codebuff/common/util/array'
import { isSubdir } from '@codebuff/common/util/file'
import {
  stripColors,
  suffixPrefixOverlap,
  truncateStringWithMessage,
} from '@codebuff/common/util/string'

import {
  getProjectRoot,
  getWorkingDirectory,
  setWorkingDirectory,
} from '../project-files'
import { trackEvent } from '../utils/analytics'
import { detectShell } from '../utils/detect-shell'
import { logger } from '../utils/logger'
import { runBackgroundCommand } from './background'

const COMMAND_OUTPUT_LIMIT = 10_000
const promptIdentifier = '@36261@'
const needleIdentifier = '@76593@'
const setUpPromptIdentifierCommand = `PS1="@362""61@" && PS2="@362""61@"`

type PersistentProcess =
  | {
      type: 'pty'
      shell: 'cmd.exe' | 'powershell.exe' | 'bash'
      pty: IPty
      timerId: NodeJS.Timeout | null
      globalOutputBuffer: string
      globalOutputLastReadLength: number
      setupPromise: Promise<any>
    }
  | {
      type: 'process'
      shell: 'bash' | 'cmd.exe' | 'powershell.exe'
      childProcess: ChildProcessWithoutNullStreams | null
      timerId: NodeJS.Timeout | null
      globalOutputBuffer: string
      globalOutputLastReadLength: number
    }

const createPersistantProcess = async (
  dir: string,
  forceChildProcess = false
): Promise<PersistentProcess> => {
  const bunPty = await loadBunPty()

  if (bunPty && process.env.NODE_ENV !== 'test' && !forceChildProcess) {
    const isWindows = os.platform() === 'win32'
    const currShell = detectShell()
    const shell = isWindows
      ? currShell === 'powershell'
        ? 'powershell.exe'
        : 'cmd.exe'
      : 'bash'

    const shellWithoutExe = shell.split('.')[0]

    // Prepare shell init commands
    let shellInitCommands: string[] = []
    if (!isWindows) {
      shellInitCommands.push('true')
      // Source all relevant config files based on shell type
      if (currShell === 'zsh') {
        shellInitCommands.push(
          'source ~/.zshenv 2>/dev/null || true',
          'source ~/.zprofile 2>/dev/null || true',
          'source ~/.zshrc 2>/dev/null || true',
          'source ~/.zlogin 2>/dev/null || true'
        )
      } else if (currShell === 'fish') {
        shellInitCommands.push(
          'source ~/.config/fish/config.fish 2>/dev/null || true'
        )
      } else {
        // Bash - source both profile and rc files
        shellInitCommands.push(
          'source ~/.bash_profile 2>/dev/null || true',
          'source ~/.profile 2>/dev/null || true',
          'source ~/.bashrc 2>/dev/null || true'
        )
      }
      shellInitCommands = shellInitCommands.map(
        (c) => `(${c}) && ${setUpPromptIdentifierCommand}`
      )
    } else if (currShell === 'powershell') {
      // Try to source all possible PowerShell profile locations
      shellInitCommands.push(
        '$profiles = @($PROFILE.AllUsersAllHosts,$PROFILE.AllUsersCurrentHost,$PROFILE.CurrentUserAllHosts,$PROFILE.CurrentUserCurrentHost)',
        'foreach ($prof in $profiles) { if (Test-Path $prof) { . $prof } }'
      )
    }

    try {
      const persistentPty = bunPty.spawn(shell, isWindows ? [] : ['--login'], {
        name: 'xterm-256color',
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
        cwd: dir,
        env: {
          ...(process.env as any),
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

      const setupPromise = new Promise<void>(async (resolve) => {
        for (const command of shellInitCommands) {
          await runSinglePtyCommand(persistentPty, command, () => {})
        }
        resolve()
      })

      const persistentProcessInfo: PersistentProcess = {
        type: 'pty',
        shell,
        pty: persistentPty,
        timerId: null,
        globalOutputBuffer: '',
        globalOutputLastReadLength: 0,
        setupPromise,
      }

      persistentPty.onData((data: string) => {
        if (persistentProcessInfo.type === 'pty') {
          persistentProcessInfo.globalOutputBuffer += data.toString() // Should we use stripColors(...)?
        }
      })

      return persistentProcessInfo
    } catch (error) {
      logger.error(
        { error, platform: os.platform(), arch: os.arch() },
        'Failed to create PTY process, falling back to child_process'
      )
      // Fall through to child_process fallback
    }
  }

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

export let persistentProcess: Awaited<
  ReturnType<typeof createPersistantProcess>
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

export const recreateShell = async (cwd: string, forceChildProcess = false) => {
  persistentProcess = await createPersistantProcess(cwd, forceChildProcess)
}

export const resetShell = async (cwd: string) => {
  commandIsRunning = false
  if (persistentProcess) {
    if (persistentProcess.timerId) {
      clearTimeout(persistentProcess.timerId)
      persistentProcess.timerId = null
    }

    if (persistentProcess.type === 'pty') {
      persistentProcess.pty.kill()
      await recreateShell(cwd)
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
    `<output>${truncateStringWithMessage({ str: stripColors(stdout), maxLength: COMMAND_OUTPUT_LIMIT, remove: 'MIDDLE' })}</output>`,
    `<status>${status}</status>`,
    '</terminal_command_result>'
  ).join('\n')
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
  ptyProcess: any,
  command: string,
  onChunk: (data: string) => void
): Promise<{ filteredOutput: string; fullOutput: string }> {
  const isWindows = os.platform() === 'win32'
  let fullOutput = promptIdentifier
  let filteredOutput = ''
  let buffer = promptIdentifier
  let echoLinesRemaining = isWindows ? 1 : command.split('\n').length

  const resultPromise = new Promise<{
    filteredOutput: string
    fullOutput: string
  }>((resolve) => {
    const dataDisposable = ptyProcess.onData((data: string) => {
      fullOutput += data
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
      filteredOutput += toProcess

      const commandDone = buffer.startsWith(promptIdentifier)
      if (commandDone && echoLinesRemaining === 0) {
        // Command is done
        dataDisposable.dispose()

        resolve({ filteredOutput, fullOutput })
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
    // Use direct terminal escape sequence to clear the screen
    process.stdout.write('\u001b[2J\u001b[0;0H')
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
    await persistentProcess.setupPromise

    let fullCombinedOutput = ''

    const cdCommand = `cd ${cwd}`
    const { fullOutput: cdOutput } = await runSinglePtyCommand(
      ptyProcess,
      cdCommand,
      () => {}
    )
    fullCombinedOutput += `${JSON.stringify(cdCommand).slice(1, -1)}\n${cdOutput}\n\n`

    const { fullOutput: fullCommandOutput } = await runSinglePtyCommand(
      ptyProcess,
      command,
      (data: string) => {
        commandOutput += data
        process.stdout.write(data)
      }
    )
    fullCombinedOutput += `${JSON.stringify(command).slice(1, -1)}\n${fullCommandOutput}\n\n`

    const fullExitCodeCommand =
      persistentProcess.shell === 'cmd.exe'
        ? `echo ${needleIdentifier}%ERRORLEVEL%${needleIdentifier}`
        : `echo ${needleIdentifier}$?${needleIdentifier}`
    const { filteredOutput: exitCodeHaystack, fullOutput: fullExitCodeOutput } =
      await runSinglePtyCommand(ptyProcess, fullExitCodeCommand, () => {})
    fullCombinedOutput += `${JSON.stringify(fullExitCodeCommand).slice(1, -1)}\n${fullExitCodeOutput}\n\n`
    let exitCode: number | null = null
    const exitCodeMatch = exitCodeHaystack.match(getNeedlePattern('\\d+'))
    if (exitCodeMatch) {
      exitCode = parseInt(exitCodeMatch[1].trim())
    } else {
      logger.error(
        { exitCodeHaystack, fullExitCodeOutput },
        'Could not find exitCode in output'
      )
    }

    const cwdCommand = isWindows
      ? `echo ${needleIdentifier}%cd%${needleIdentifier}`
      : `echo ${needleIdentifier}$(pwd)${needleIdentifier}`
    const { filteredOutput: cwdHaystack, fullOutput: fullCwdOutput } =
      await runSinglePtyCommand(ptyProcess, cwdCommand, () => {})
    fullCombinedOutput += `${JSON.stringify(cwdCommand).slice(1, -1)}\n${fullCwdOutput}\n\n`
    const cwdMatch = cwdHaystack.match(getNeedlePattern())
    let newWorkingDirectory
    if (cwdMatch) {
      newWorkingDirectory = cwdMatch[1].trim()
    } else {
      logger.error(
        { cwdHaystack, fullExitCodeOutput },
        'Could not find cwd in output'
      )
      newWorkingDirectory = cwd
    }

    if (!exitCodeMatch || !cwdMatch) {
      logger.error(
        { fullCombinedOutput },
        'Could not find either exitCode or cwd in output'
      )
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
          `Starting cwd: ${currentWorkingDirectory}`,
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
  persistentProcess: PersistentProcess & {
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

  // Update the persistent process with the new child process
  if (persistentProcess.type === 'process') {
    persistentProcess.childProcess = childProcess
  }

  let timer: NodeJS.Timeout | null = null
  if (maybeTimeoutSeconds !== null) {
    timer = setTimeout(async () => {
      await resetShell(cwd)
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

  if (persistentProcess.type === 'process') {
    persistentProcess.timerId = timer
  }

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
