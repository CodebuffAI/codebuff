import { runTerminalCommand } from '@codebuff/sdk'
import { createCliRenderer } from '@opentui/core'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import { installProcessCleanupHandlers } from '../utils/renderer-cleanup'
import { startTerminalWatchdog } from '../utils/terminal-watchdog'
import {
  installTerminalProtocolController,
  terminalCommandIsolation,
} from '../utils/terminal-protocol-controller'
import { writeTerminalControlSync } from '../utils/terminal-io'

import type { CliRenderer } from '@opentui/core'
import type { CodebuffToolOutput } from '@codebuff/sdk'

const ENABLE_FOCUS_REPORTING = '\x1b[?1004h'
const DISABLE_FOCUS_REPORTING = '\x1b[?1004l'
const WAIT_INTERVAL_MS = 25

type TerminalResult =
  CodebuffToolOutput<'run_terminal_command'>[number]['value']

type SmokeResult = {
  ok: boolean
  platform: NodeJS.Platform
  stdinIsTTY: boolean
  stdoutIsTTY: boolean
  simpleCommand?: { stdout: string; stderr: string; exitCode: number | null }
  overlap?: {
    focusStates: boolean[]
    controlWrites: string[]
    mouseDisabledDuringOverlap: boolean
    mouseDisabledAfterFirstCancellation: boolean
    mouseRestoredAfterFinalCommand: boolean
    firstCancellationMessage: string
    secondStdout: string
    consoleReaderStdout: string
  }
  isolationFailure?: { message: string; commandStarted: boolean }
  error?: string
  stack?: string
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function toBashPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function asTerminalResult(
  output: CodebuffToolOutput<'run_terminal_command'>,
): TerminalResult {
  assertSmoke(output.length === 1, 'terminal command returned no result')
  return output[0].value
}

function readString(value: TerminalResult, key: 'stdout' | 'stderr'): string {
  if (key === 'stdout') {
    return 'stdout' in value && typeof value.stdout === 'string'
      ? value.stdout
      : ''
  }
  return 'stderr' in value && typeof value.stderr === 'string'
    ? value.stderr
    : ''
}

function readExitCode(value: TerminalResult): number | null {
  return 'exitCode' in value && typeof value.exitCode === 'number'
    ? value.exitCode
    : null
}

function readMessage(value: TerminalResult): string {
  return 'message' in value && typeof value.message === 'string'
    ? value.message
    : ''
}

async function waitFor(
  condition: () => boolean,
  timeoutMs: number,
  failureMessage: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(failureMessage)
    await Bun.sleep(WAIT_INTERVAL_MS)
  }
}

function writeResult(resultPath: string, result: SmokeResult): void {
  mkdirSync(path.dirname(resultPath), { recursive: true })
  writeFileSync(resultPath, JSON.stringify(result, null, 2))
}

async function destroyRenderer(renderer: CliRenderer): Promise<void> {
  if (renderer.isDestroyed) return
  await new Promise<void>((resolve, reject) => {
    const onDestroy = () => {
      clearTimeout(timeout)
      resolve()
    }
    const timeout = setTimeout(() => {
      renderer.removeListener('destroy', onDestroy)
      if (renderer.isDestroyed) {
        resolve()
        return
      }
      reject(new Error('OpenTUI renderer did not finish destroying'))
    }, 2_000)
    renderer.once('destroy', onDestroy)
    renderer.destroy()
  })
}

function createConsoleReaderScript(markerPath: string): string {
  const quotedMarker = markerPath.replace(/'/g, "''")
  return [
    `$ErrorActionPreference = 'Stop'`,
    `[System.IO.File]::WriteAllText('${quotedMarker}', 'ready')`,
    `try {`,
    `  $stream = [System.IO.File]::Open('CONIN$', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)`,
    `  $buffer = New-Object byte[] 4096`,
    `  $count = $stream.Read($buffer, 0, $buffer.Length)`,
    `  if ($count -gt 0) {`,
    `    $hex = [System.BitConverter]::ToString($buffer, 0, $count).Replace('-', '')`,
    `    [Console]::Out.WriteLine('CONSOLE_LEAK_HEX:' + $hex)`,
    `  }`,
    `} catch {`,
    `  [Console]::Out.WriteLine('CONSOLE_UNAVAILABLE')`,
    `}`,
    `Start-Sleep -Seconds 20`,
  ].join('\r\n')
}

export async function runPackagedTerminalIsolationSmoke({
  resultPath,
  exchangeDir,
}: {
  resultPath: string
  exchangeDir: string
}): Promise<number> {
  const result: SmokeResult = {
    ok: false,
    platform: process.platform,
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
  }
  let renderer: CliRenderer | null = null

  try {
    assertSmoke(
      process.platform === 'win32',
      'terminal isolation acceptance smoke only runs on Windows',
    )
    assertSmoke(
      process.stdin.isTTY && process.stdout.isTTY,
      'terminal isolation smoke requires a native Windows console',
    )

    mkdirSync(exchangeDir, { recursive: true })
    const harnessReadyPath = path.join(exchangeDir, 'isolation-ready')
    const reportsSentPath = path.join(exchangeDir, 'reports-sent')
    const consoleReaderReadyPath = path.join(
      exchangeDir,
      'console-reader-ready',
    )
    const consoleReaderScriptPath = path.join(exchangeDir, 'console-reader.ps1')
    const forbiddenSpawnPath = path.join(
      exchangeDir,
      'isolation-failure-spawned',
    )
    writeFileSync(
      consoleReaderScriptPath,
      createConsoleReaderScript(consoleReaderReadyPath),
    )

    startTerminalWatchdog()
    renderer = await createCliRenderer({
      backgroundColor: 'transparent',
      exitOnCtrlC: false,
      screenMode: 'alternate-screen',
    })
    installProcessCleanupHandlers(renderer)

    const controlWrites: string[] = []
    const controller = installTerminalProtocolController(renderer, {
      writeControl: (sequence) => {
        controlWrites.push(sequence)
        return writeTerminalControlSync(sequence)
      },
    })
    renderer.once('destroy', () => controller.dispose())

    const focusStates: boolean[] = []
    const unsubscribeFocus = controller.subscribeToFocus({
      onFocusChange: (focused) => focusStates.push(focused),
    })

    const simple = asTerminalResult(
      await runTerminalCommand({
        command: `printf 'COMMAND_OK'; printf 'COMMAND_ERR' >&2`,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: 10,
        terminalCommandIsolation,
      }),
    )
    const simpleStdout = readString(simple, 'stdout')
    const simpleStderr = readString(simple, 'stderr')
    const simpleExitCode = readExitCode(simple)
    assertSmoke(simpleStdout === 'COMMAND_OK', 'simple command stdout was lost')
    assertSmoke(
      simpleStderr === 'COMMAND_ERR',
      'simple command stderr was lost',
    )
    assertSmoke(
      simpleExitCode === 0,
      'simple command did not exit successfully',
    )
    result.simpleCommand = {
      stdout: simpleStdout,
      stderr: simpleStderr,
      exitCode: simpleExitCode,
    }

    const overlapWriteStart = controlWrites.length
    const firstAbort = new AbortController()
    const readerCommand =
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ` +
      shellQuote(toBashPath(consoleReaderScriptPath))
    const firstRun = runTerminalCommand({
      command: readerCommand,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 30,
      signal: firstAbort.signal,
      terminalCommandIsolation,
    })
    const secondRun = runTerminalCommand({
      command: `sleep 5; printf 'SECOND_DONE'`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 15,
      terminalCommandIsolation,
    })

    const mouseDisabledDuringOverlap = renderer.useMouse === false
    assertSmoke(
      mouseDisabledDuringOverlap,
      'mouse reporting remained enabled during overlapping commands',
    )
    assertSmoke(
      controlWrites.slice(overlapWriteStart).join('') ===
        DISABLE_FOCUS_REPORTING,
      'overlapping commands did not share one focus-isolation transition',
    )

    await waitFor(
      () => existsSync(consoleReaderReadyPath),
      10_000,
      'console reader descendant did not start',
    )
    writeFileSync(harnessReadyPath, 'ready')
    await waitFor(
      () => existsSync(reportsSentPath),
      10_000,
      'native Windows harness did not inject terminal reports',
    )
    await waitFor(
      () => focusStates.includes(false) && focusStates.includes(true),
      5_000,
      'OpenTUI did not deliver injected focus activity to the controller',
    )
    await Bun.sleep(250)

    firstAbort.abort()
    const first = asTerminalResult(await firstRun)
    const firstCancellationMessage = readMessage(first)
    assertSmoke(
      firstCancellationMessage.includes('aborted by the user'),
      'first overlapping command did not report cancellation',
    )
    const mouseDisabledAfterFirstCancellation = renderer.useMouse === false
    assertSmoke(
      mouseDisabledAfterFirstCancellation,
      'canceling one overlapping command restored mouse reporting too early',
    )

    const second = asTerminalResult(await secondRun)
    const secondStdout = readString(second, 'stdout')
    assertSmoke(
      secondStdout === 'SECOND_DONE',
      'the remaining overlapping command did not finish normally',
    )
    await waitFor(
      () => renderer!.useMouse === true,
      5_000,
      'mouse reporting was not restored after the final process tree exited',
    )
    const mouseRestoredAfterFinalCommand = renderer.useMouse === true
    const overlapWrites = controlWrites.slice(overlapWriteStart)
    assertSmoke(
      overlapWrites.join('') ===
        DISABLE_FOCUS_REPORTING + ENABLE_FOCUS_REPORTING,
      'focus reporting did not restore exactly once after the final command',
    )

    const consoleReaderStdout = readString(first, 'stdout')
    assertSmoke(
      !consoleReaderStdout.includes('CONSOLE_LEAK_HEX:'),
      'a command descendant read queued terminal reports from CONIN$',
    )
    result.overlap = {
      focusStates,
      controlWrites: overlapWrites,
      mouseDisabledDuringOverlap,
      mouseDisabledAfterFirstCancellation,
      mouseRestoredAfterFinalCommand,
      firstCancellationMessage,
      secondStdout,
      consoleReaderStdout,
    }

    unsubscribeFocus()
    controller.dispose()
    const failingController = installTerminalProtocolController(renderer, {
      platform: 'win32',
      writeControl: () => false,
    })
    let failureMessage = ''
    try {
      await runTerminalCommand({
        command: `printf 'spawned' > ${shellQuote(toBashPath(forbiddenSpawnPath))}`,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: 10,
        terminalCommandIsolation,
      })
      throw new Error('command unexpectedly started without terminal isolation')
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error)
    } finally {
      failingController.dispose()
    }
    assertSmoke(
      failureMessage.includes('Restart Freebuff') &&
        failureMessage.includes('Windows Terminal'),
      'terminal isolation failure did not include actionable recovery guidance',
    )
    assertSmoke(
      !existsSync(forbiddenSpawnPath),
      'terminal command spawned after isolation acquisition failed',
    )
    assertSmoke(
      renderer.useMouse === true,
      'failed isolation acquisition did not roll back mouse state',
    )
    result.isolationFailure = {
      message: failureMessage,
      commandStarted: existsSync(forbiddenSpawnPath),
    }

    await destroyRenderer(renderer)
    result.ok = true
    writeResult(resultPath, result)
    return 0
  } catch (error) {
    result.ok = false
    result.error = error instanceof Error ? error.message : String(error)
    if (error instanceof Error && error.stack) result.stack = error.stack
    if (renderer && !renderer.isDestroyed) {
      try {
        await destroyRenderer(renderer)
      } catch (cleanupError) {
        result.error += `; cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      }
    }
    writeResult(resultPath, result)
    return 1
  }
}
