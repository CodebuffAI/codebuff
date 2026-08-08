import { runTerminalCommand } from '@codebuff/sdk'
import { createCliRenderer } from '@opentui/core'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import { installProcessCleanupHandlers } from '../utils/renderer-cleanup'
import { startTerminalWatchdog } from '../utils/terminal-watchdog'
import {
  createTerminalCommandBroker,
  terminalCommandBroker,
} from '../utils/terminal-command-broker'
import { installTerminalProtocolController } from '../utils/terminal-protocol-controller'
import { writeTerminalControlSync } from '../utils/terminal-io'

import type { CliRenderer } from '@opentui/core'
import type { CodebuffToolOutput } from '@codebuff/sdk'

const WAIT_INTERVAL_MS = 25

type TerminalResult =
  CodebuffToolOutput<'run_terminal_command'>[number]['value']

type SmokeResult = {
  ok: boolean
  platform: NodeJS.Platform
  stdinIsTTY: boolean
  stdoutIsTTY: boolean
  simpleCommand?: { stdout: string; stderr: string; exitCode: number | null }
  repeatedCommands?: { completed: number }
  overlap?: {
    focusStates: boolean[]
    controlWrites: string[]
    mouseStayedEnabledDuringOverlap: boolean
    mouseStayedEnabledAfterCancellation: boolean
    mouseStayedEnabledAfterCompletion: boolean
    firstCancellationMessage: string
    secondStdout: string
    consoleReaderStdout: string
  }
  brokerFailure?: { message: string; commandStarted: boolean }
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
      renderer.isDestroyed
        ? resolve()
        : reject(new Error('OpenTUI renderer did not finish destroying'))
    }, 2_000)
    renderer.once('destroy', onDestroy)
    renderer.destroy()
  })
}

/**
 * `markerPath` is written before the CONIN$ probe so the harness knows the descendant is alive and
 * can start injecting terminal reports for a leaked console to pick up. It cannot also stand for
 * "the probe finished" — it is written while the outcome is still unknown.
 *
 * `verdictPath` is written once the probe has resolved, down both branches, and is what makes the
 * abort deterministic. Waiting a fixed interval after the ready marker instead raced PowerShell's
 * startup on a loaded runner and aborted before the verdict reached stdout.
 *
 * The flush is load-bearing: the broker force-kills on Windows (`taskkill /f`), so a line still
 * sitting in PowerShell's own buffer is lost outright rather than drained from the pipe.
 */
function createConsoleReaderScript(
  markerPath: string,
  verdictPath: string,
): string {
  const quotedMarker = markerPath.replace(/'/g, "''")
  const quotedVerdict = verdictPath.replace(/'/g, "''")
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
    `[Console]::Out.Flush()`,
    `[System.IO.File]::WriteAllText('${quotedVerdict}', 'done')`,
    `Start-Sleep -Seconds 20`,
  ].join('\r\n')
}

export async function runPackagedTerminalBrokerSmoke({
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
    assertSmoke(process.platform === 'win32', 'broker smoke requires Windows')
    assertSmoke(
      process.stdin.isTTY && process.stdout.isTTY,
      'broker smoke requires a native Windows console',
    )

    mkdirSync(exchangeDir, { recursive: true })
    const harnessReadyPath = path.join(exchangeDir, 'broker-ready')
    const reportsSentPath = path.join(exchangeDir, 'reports-sent')
    const consoleReaderReadyPath = path.join(
      exchangeDir,
      'console-reader-ready',
    )
    const consoleReaderVerdictPath = path.join(
      exchangeDir,
      'console-reader-verdict',
    )
    const consoleReaderScriptPath = path.join(exchangeDir, 'console-reader.ps1')
    const forbiddenSpawnPath = path.join(exchangeDir, 'broker-failure-spawned')
    writeFileSync(
      consoleReaderScriptPath,
      createConsoleReaderScript(
        consoleReaderReadyPath,
        consoleReaderVerdictPath,
      ),
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
        terminalCommandBroker,
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
      terminalCommandBroker,
    })
    const secondRun = runTerminalCommand({
      command: `sleep 5; printf 'SECOND_DONE'`,
      process_type: 'SYNC',
      cwd: process.cwd(),
      timeout_seconds: 15,
      terminalCommandBroker,
    })

    const mouseStayedEnabledDuringOverlap = renderer.useMouse === true
    assertSmoke(
      mouseStayedEnabledDuringOverlap,
      'brokers changed mouse reporting',
    )
    assertSmoke(
      controlWrites.length === overlapWriteStart,
      'brokers changed focus reporting',
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
      'OpenTUI did not receive focus activity while commands ran',
    )
    // Only abort once the descendant has actually resolved its CONIN$ probe and flushed the
    // verdict. This sits after the reports-sent wait deliberately: a descendant that DID inherit a
    // console is blocked in $stream.Read until those reports arrive, and only then writes its leak
    // line and the verdict. A descendant with no console fails File.Open immediately, so if the
    // verdict never lands the open must have succeeded — which is itself the leak this asserts
    // against, hence the wording below rather than a bare timeout.
    // 10s to match the waits above, and because the abort has a real budget: the script exits on
    // its own after Start-Sleep -Seconds 20 and firstRun times out at 30, either of which would
    // turn the cancellation assertion below into a confusing failure. In practice the verdict is
    // already on disk by the time this runs — a console-free open throws at once.
    await waitFor(
      () => existsSync(consoleReaderVerdictPath),
      10_000,
      'console reader never resolved its CONIN$ probe — an open that blocks instead of failing means the descendant did have a Windows console',
    )

    firstAbort.abort()
    const first = asTerminalResult(await firstRun)
    const firstCancellationMessage = readMessage(first)
    assertSmoke(
      firstCancellationMessage.includes('aborted by the user'),
      'first overlapping command did not report cancellation',
    )
    const mouseStayedEnabledAfterCancellation = renderer.useMouse === true
    assertSmoke(
      mouseStayedEnabledAfterCancellation,
      'broker cancellation changed mouse reporting',
    )

    const second = asTerminalResult(await secondRun)
    const secondStdout = readString(second, 'stdout')
    assertSmoke(secondStdout === 'SECOND_DONE', 'overlapping command was lost')
    const mouseStayedEnabledAfterCompletion = renderer.useMouse === true
    const overlapWrites = controlWrites.slice(overlapWriteStart)
    assertSmoke(
      overlapWrites.length === 0,
      'completion changed focus reporting',
    )

    const consoleReaderStdout = readString(first, 'stdout')
    assertSmoke(
      !consoleReaderStdout.includes('CONSOLE_LEAK_HEX:'),
      'a command descendant read terminal reports from CONIN$',
    )
    assertSmoke(
      consoleReaderStdout.includes('CONSOLE_UNAVAILABLE'),
      'the command descendant still had a Windows console',
    )
    result.overlap = {
      focusStates,
      controlWrites: overlapWrites,
      mouseStayedEnabledDuringOverlap,
      mouseStayedEnabledAfterCancellation,
      mouseStayedEnabledAfterCompletion,
      firstCancellationMessage,
      secondStdout,
      consoleReaderStdout,
    }

    // The Windows failure that motivated this gate appeared only after users
    // had run several agent commands. Exercise repeated packaged-broker stdio
    // setup after the driver has completed its time-sensitive report injection.
    const repeatedCommandCount = 64
    for (let index = 0; index < repeatedCommandCount; index++) {
      const marker = `REPEATED_${index}`
      const repeated = asTerminalResult(
        await runTerminalCommand({
          command: `printf '${marker}'`,
          process_type: 'SYNC',
          cwd: process.cwd(),
          timeout_seconds: 10,
          terminalCommandBroker,
        }),
      )
      assertSmoke(
        readString(repeated, 'stdout') === marker,
        `repeated broker command ${index} lost its output`,
      )
      assertSmoke(
        readExitCode(repeated) === 0,
        `repeated broker command ${index} failed`,
      )
    }
    result.repeatedCommands = { completed: repeatedCommandCount }

    let failureMessage = ''
    try {
      await runTerminalCommand({
        command: `printf 'spawned' > ${shellQuote(toBashPath(forbiddenSpawnPath))}`,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: 10,
        terminalCommandBroker: createTerminalCommandBroker({
          invocation: () => ({
            executable: path.join(
              exchangeDir,
              `missing-terminal-broker-${crypto.randomUUID()}.exe`,
            ),
            args: [],
          }),
        }),
      })
      throw new Error('command unexpectedly started without its broker')
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error)
    }
    result.brokerFailure = {
      message: failureMessage,
      commandStarted: existsSync(forbiddenSpawnPath),
    }
    assertSmoke(
      failureMessage.includes('Restart Freebuff'),
      'broker failure did not include actionable recovery guidance',
    )
    assertSmoke(
      !existsSync(forbiddenSpawnPath),
      'command spawned after broker startup failed',
    )

    unsubscribeFocus()
    controller.dispose()
    await destroyRenderer(renderer)
    result.ok = true
    writeResult(resultPath, result)
    return 0
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    if (error instanceof Error && error.stack) result.stack = error.stack
    if (renderer && !renderer.isDestroyed) {
      try {
        await destroyRenderer(renderer)
      } catch (cleanupError) {
        result.error += `; cleanup failed: ${errorMessage(cleanupError)}`
      }
    }
    writeResult(resultPath, result)
    return 1
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
