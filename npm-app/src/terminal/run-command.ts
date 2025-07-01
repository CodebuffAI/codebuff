import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { mkdtempSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import * as os from 'os'
import path, { join } from 'path'
import { green } from 'picocolors'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { buildArray } from '@codebuff/common/util/array'
import { isSubdir } from '@codebuff/common/util/file'
import {
  stripColors,
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

/* ------------------------------------------------------------------ */
/* constants                                                          */
/* ------------------------------------------------------------------ */

const COMMAND_OUTPUT_LIMIT = 10_000
const IS_WINDOWS = os.platform() === 'win32'

/* ------------------------------------------------------------------ */
/* colour‑helper : adds "--color" style flags when missing            */
/* ------------------------------------------------------------------ */

function applyColorHints(cmd: string): string {
  /* don't touch complex pipelines – best effort */
  if (cmd.includes('|') || cmd.includes('>')) return cmd

  /* ---------- git -------------------------------------------------- */
  if (/^\s*git\b/.test(cmd) && !/--color\b/.test(cmd)) {
    if (/\bdiff\b/.test(cmd)) return `${cmd} --color=always`
    if (/\blog\b/.test(cmd)) return `${cmd} --color=always`
    if (/\bshow\b/.test(cmd)) return `${cmd} --color=always`
  }

  /* ---------- grep / ripgrep --------------------------------------- */
  if (/\b(rg|grep|egrep|fgrep)\b/.test(cmd) && !/--color\b/.test(cmd)) {
    return `${cmd} --color=always`
  }

  /* ---------- ls ---------------------------------------------------- */
  if (/^\s*ls\b/.test(cmd) && !/--color\b/.test(cmd) && !/\s\-G\b/.test(cmd)) {
    return IS_WINDOWS // Git‑Bash ls honours GNU flag on win
      ? `${cmd} --color=always`
      : process.platform === 'darwin' // BSD ls
        ? `${cmd} -G`
        : `${cmd} --color=always`
  }

  /* ---------- tree -------------------------------------------------- */
  if (/^\s*tree\b/.test(cmd) && !/\s\-C\b/.test(cmd)) {
    return `${cmd} -C`
  }

  return cmd
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

/** Which family of shell are we launching? */
type UnixShell =
  | 'bash'
  | 'zsh'
  | 'fish'
  | 'ksh'
  | 'sh' // /bin/sh or dash
  | 'tcsh'
  | 'nu' // nushell
type WinShell = 'cmd.exe' | 'powershell.exe' | 'pwsh.exe'

type ShellKind = UnixShell | WinShell

function basename(cmd: string) {
  return path.basename(cmd).toLowerCase()
}

/** Decide which concrete binary to start based on platform + env */
function selectShell(): ShellKind {
  if (!IS_WINDOWS) {
    const fromEnv = process.env.SHELL || detectShell() || '/bin/bash'
    const base = basename(fromEnv)

    if (base.includes('zsh')) return 'zsh'
    if (base.includes('fish')) return 'fish'
    if (base.includes('ksh')) return 'ksh'
    if (base.includes('tcsh')) return 'tcsh'
    if (base.includes('nu')) return 'nu'
    if (base.includes('bash')) return 'bash'
    return 'sh'
  }

  /* Windows -------------------------------------------------------- */
  const preferPwsh =
    typeof spawn === 'function' && // avoid ts-node compile‑time error
    !!process.env.Path?.toLowerCase()
      .split(';')
      .find((p) => p.includes('powershell'))

  if (preferPwsh) return 'pwsh.exe'
  if (detectShell() === 'powershell') return 'powershell.exe'
  return 'cmd.exe'
}

/** Build shell‑specific “initialisation” snippets. */
function buildInit(shell: ShellKind): string[] {
  if (IS_WINDOWS) {
    if (shell === 'powershell.exe' || shell === 'pwsh.exe') {
      return [
        '$profiles = @(' +
          '$PROFILE.AllUsersAllHosts,' +
          '$PROFILE.AllUsersCurrentHost,' +
          '$PROFILE.CurrentUserAllHosts,' +
          '$PROFILE.CurrentUserCurrentHost' +
          ')',
        'foreach ($p in $profiles) { if (Test-Path $p) { . $p } }',
      ]
    }
    /* cmd.exe has nothing useful we can “source”                          */
    return []
  }

  switch (shell) {
    case 'zsh':
      return [
        'source ~/.zshenv 2>/dev/null || true',
        'source ~/.zprofile 2>/dev/null || true',
        'source ~/.zshrc 2>/dev/null || true',
        'source ~/.zlogin 2>/dev/null || true',
      ]
    case 'fish':
      return ['source ~/.config/fish/config.fish 2>/dev/null || true']
    case 'ksh':
      return ['source ~/.kshrc 2>/dev/null || true']
    case 'tcsh':
      return ['source ~/.tcshrc 2>/dev/null || true']
    case 'nu':
      return ['source ~/.config/nushell/env.nu 2>/dev/null || true']
    case 'bash':
    case 'sh':
    default:
      return [
        'source ~/.bash_profile 2>/dev/null || true',
        'source ~/.profile 2>/dev/null || true',
        'source ~/.bashrc 2>/dev/null || true',
      ]
  }
}

/** Build environment */
function buildEnv(shell: ShellKind): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PAGER: 'cat',
    GIT_PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
    LESS: '-FRX',
    /* ---- colour‑forcing vars -------------------------------------- */
    FORCE_COLOR: '3', // chalk / picocolors / many Node CLIs
    CLICOLOR: '1', // coreutils (BSD) honour this
    CLICOLOR_FORCE: '1',
    GIT_CONFIG_PARAMETERS: `'color.ui=always'`,
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
  }

  if (IS_WINDOWS) {
    env.TERM = 'cygwin'
  } else {
    env.TERM = 'xterm-256color'
    env.SHELL = process.env.SHELL || shell
  }

  return env
}

/** Create a one‑shot wrapper script for Unix‑like shells. */
function createWrapperScript(
  shell: UnixShell,
  initLines: string[],
  userCmd: string
) {
  const tmp = mkdtempSync(join(tmpdir(), 'codebuff-')) // safe unique dir
  const scriptPath = join(tmp, `cmd.${shell}`)

  const shebang =
    shell === 'bash' || shell === 'sh'
      ? '#!/usr/bin/env bash'
      : shell === 'zsh'
        ? '#!/usr/bin/env zsh'
        : shell === 'fish'
          ? '#!/usr/bin/env fish'
          : shell === 'ksh'
            ? '#!/usr/bin/env ksh'
            : shell === 'tcsh'
              ? '#!/usr/bin/env tcsh'
              : shell === 'nu'
                ? '#!/usr/bin/env nu'
                : '#!/usr/bin/env sh'

  const aliasEnable =
    shell === 'bash'
      ? 'shopt -s expand_aliases'
      : shell === 'zsh'
        ? 'setopt aliases'
        : ''

  writeFileSync(
    scriptPath,
    [
      shebang,
      aliasEnable,
      ...initLines,
      '',
      userCmd,
      '', // final newline
    ].join('\n'),
    { mode: 0o755 }
  )

  return scriptPath
}

/** Windows : translate shell+init+cmd -> executable + argv */
function buildWinInvocation(
  shell: WinShell,
  initLines: string[],
  userCmd: string
): { exe: string; args: string[] } {
  const init = initLines.join('; ')
  const cmdAll = init ? `${init}; ${userCmd}` : userCmd

  if (shell === 'cmd.exe') {
    return { exe: 'cmd.exe', args: ['/d', '/s', '/c', cmdAll] } // ﻿˅ doc  :contentReference[oaicite:0]{index=0}
  }

  /* PowerShell / pwsh -------------------------------------------------- */
  return {
    exe: shell,
    args: [
      '-NoLogo',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      cmdAll,
    ],
  }
}

/* ------------------------------------------------------------------ */
/* persistent‑process bookkeeping                                     */
/* ------------------------------------------------------------------ */

export type PersistentProcess = {
  type: 'process'
  shell: ShellKind
  childProcess: ChildProcessWithoutNullStreams | null
  timerId: NodeJS.Timeout | null
  globalOutputBuffer: string
  globalOutputLastReadLength: number
  env: NodeJS.ProcessEnv
  shellInitCommands: string[]
}

async function createPersistentProcess(
  dir: string
): Promise<PersistentProcess> {
  const shell = selectShell()
  const env = buildEnv(shell)
  const shellInitCommands = buildInit(shell)

  logger.debug({ shell, shellInitCommands }, 'Initialised persistent shell')

  return {
    type: 'process',
    shell,
    childProcess: null,
    timerId: null,
    globalOutputBuffer: '',
    globalOutputLastReadLength: 0,
    env,
    shellInitCommands,
  }
}

/* ------------------------------------------------------------------ */
/* exported state + helpers                                           */
/* ------------------------------------------------------------------ */

export let persistentProcess: Awaited<
  ReturnType<typeof createPersistentProcess>
> | null = null

let commandIsRunning = false

export const isCommandRunning = () => commandIsRunning

export const recreateShell = async (cwd: string) => {
  persistentProcess = await createPersistentProcess(cwd)
  trackEvent(AnalyticsEvent.SHELL_RECREATED, { persistentProcess })
}

export const resetShell = async (cwd: string) => {
  commandIsRunning = false
  if (persistentProcess) {
    persistentProcess.timerId && clearTimeout(persistentProcess.timerId)
    persistentProcess.childProcess?.kill()
    persistentProcess.childProcess = null
  }
}

/* ------------------------------------------------------------------ */
/* formatting helper
/* ------------------------------------------------------------------ */

function formatResult(command: string, stdout: string, status: string): string {
  return buildArray(
    `<command>${command}</command>`,
    '<terminal_command_result>',
    `<output>${truncateStringWithMessage({
      str: stripColors(stdout),
      maxLength: COMMAND_OUTPUT_LIMIT,
      remove: 'MIDDLE',
    })}</output>`,
    `<status>${status}</status>`,
    '</terminal_command_result>'
  ).join('\n')
}

/* ------------------------------------------------------------------ */
/* PUBLIC API – runTerminalCommand                                    */
/* ------------------------------------------------------------------ */

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

  /* guard: shell must exist ------------------------------------------ */
  if (!persistentProcess)
    throw new Error('Shell not initialised – call recreateShell first')

  /* reset if concurrent ---------------------------------------------- */
  if (commandIsRunning) resetShell(cwd)
  commandIsRunning = true

  /* limit huge git logs, then add colour flags ----------------------- */
  let modifiedCmd = command.trim() === 'git log' ? 'git log -n 5' : command
  modifiedCmd = applyColorHints(modifiedCmd)

  /* analytics wrapper ------------------------------------------------- */
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
    return value
  }

  if (processType === 'BACKGROUND') {
    return new Promise((res) =>
      runBackgroundCommand(
        { toolCallId, command: modifiedCmd, mode, cwd, stdoutFile, stderrFile },
        (v) => res(resolveCommand(v))
      )
    )
  }

  /* sync mode --------------------------------------------------------- */
  return new Promise((resolve) =>
    runCommandChildProcess(
      persistentProcess!,
      modifiedCmd,
      mode,
      cwd!,
      maybeTimeoutSeconds,
      (v) => resolve(resolveCommand(v))
    )
  )
}

/* ------------------------------------------------------------------ */
/* core command runner                                                */
/* ------------------------------------------------------------------ */

const runCommandChildProcess = async (
  pp: PersistentProcess,
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
  const projectRoot = getProjectRoot()

  /* clear screen ----------------------------------------------------- */
  if (command.trim() === 'clear') {
    process.stdout.write('\u001b[2J\u001b[0;0H')
    resolve({
      result: formatResult(command, '', 'Complete'),
      stdout: '',
      exitCode: 0,
    })
    return
  }

  /* assistant prompt banner ----------------------------------------- */
  if (mode === 'assistant') {
    const displayDir = path.join(
      path.parse(projectRoot).base,
      path.relative(projectRoot, path.resolve(projectRoot, cwd))
    )
    console.log(green(`${displayDir} > ${command}`))
  }

  /* build process invocation ---------------------------------------- */
  const shell = pp.shell
  const initLines = pp.shellInitCommands
  let child: ChildProcessWithoutNullStreams

  if (IS_WINDOWS) {
    const { exe, args } = buildWinInvocation(
      shell as WinShell,
      initLines,
      command
    )
    child = spawn(exe, args, { cwd, env: pp.env })
  } else {
    const script = createWrapperScript(shell as UnixShell, initLines, command)
    child = spawn(shell, [script], { cwd, env: pp.env })

    /* cleanup tmp file */
    child.on('exit', () => {
      try {
        unlinkSync(script)
      } catch {
        /* ignore */
      }
    })
  }

  /* hook into persistent state -------------------------------------- */
  pp.childProcess = child

  /* timeout guard ---------------------------------------------------- */
  let timer: NodeJS.Timeout | null = null
  if (maybeTimeoutSeconds !== null) {
    timer = setTimeout(() => {
      resetShell(cwd)
      if (mode === 'assistant') {
        resolve({
          result: formatResult(
            command,
            '',
            `Command timed out after ${maybeTimeoutSeconds}s and was terminated.`
          ),
          stdout: '',
          exitCode: 124,
        })
      }
    }, maybeTimeoutSeconds * 1_000)
    pp.timerId = timer
  }

  /* capture output --------------------------------------------------- */
  let cmdOut = ''
  const outHandler = (data: Buffer) => {
    const s = data.toString()
    cmdOut += s
    process.stdout.write(s)
    pp.globalOutputBuffer += s
  }
  child.stdout.on('data', outHandler)
  child.stderr.on('data', outHandler)

  /* close handler ---------------------------------------------------- */
  child.on('close', (code) => {
    timer && clearTimeout(timer)

    /* cd tracking for user‑mode -------------------------------------- */
    if (command.startsWith('cd ') && mode === 'user') {
      const target = command.split(' ').slice(1).join(' ')
      const resolved = path.resolve(cwd, target)
      if (!path.relative(projectRoot, resolved).startsWith('..')) {
        setWorkingDirectory(resolved)
        trackEvent(AnalyticsEvent.CHANGE_DIRECTORY, {
          from: cwd,
          to: resolved,
          isSubdir: isSubdir(cwd, resolved),
        })
      } else {
        console.log(`
Unable to cd outside of the project root (${projectRoot})

If you want to change the project root:
1. Exit Codebuff (type "exit")
2. Navigate into the target directory (type "cd ${target}")
3. Restart Codebuff`)
      }
    }

    /* build response ------------------------------------------------- */
    const status = code === 0 ? 'Complete' : `Failed with exit code: ${code}`
    const payload =
      mode === 'assistant'
        ? formatResult(
            command,
            cmdOut,
            buildArray([`cwd: ${path.resolve(projectRoot, cwd)}`, status]).join(
              '\n\n'
            )
          )
        : formatResult(
            command,
            cmdOut,
            buildArray([
              `Starting cwd: ${cwd}`,
              `${status}\n`,
              `Final **user** cwd: ${getWorkingDirectory()} (Assistant's cwd is still project root)`,
            ]).join('\n')
          )

    resolve({ result: payload, stdout: cmdOut, exitCode: code })
  })
}

/* ------------------------------------------------------------------ */
/* misc exports                                                       */
/* ------------------------------------------------------------------ */

export function killAndResetPersistentProcess() {
  persistentProcess?.childProcess?.kill()
  persistentProcess = null
}

export function clearScreen() {
  process.stdout.write('\u001b[2J\u001b[0;0H')
}
