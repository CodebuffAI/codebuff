#!/usr/bin/env bun

import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

import type { ChildProcess } from 'child_process'

const FOCUS_OUT = '\x1b[O'
const FOCUS_IN = '\x1b[I'
const DISTINCTIVE_MOUSE_REPORT = '\x1b[<35;911;733M'
const TIMEOUT_MS = 120_000
const WINPTY_ZERO_SIZE_ASSERTION =
  'ASSERT_CONDITION("wp != nullptr && cols > 0 && rows > 0")'

function findWinpty(): string {
  const candidates = [
    process.env.CODEBUFF_WINPTY_PATH,
    path.join(
      process.env.ProgramFiles ?? 'C:\\Program Files',
      'Git',
      'usr',
      'bin',
      'winpty.exe',
    ),
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  const located = spawnSync('where.exe', ['winpty.exe'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const firstMatch = located.stdout
    ?.split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean)
  if (firstMatch && existsSync(firstMatch)) return firstMatch

  throw new Error(
    'winpty.exe was not found. Install Git for Windows or set CODEBUFF_WINPTY_PATH.',
  )
}

async function waitFor(
  condition: () => boolean,
  timeoutMs: number,
  failureMessage: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(failureMessage)
    await Bun.sleep(25)
  }
}

function visibleTranscript(value: Buffer): string {
  return value
    .toString('utf8')
    .replaceAll('\x1b', '<ESC>')
    .replace(
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,
      (character) =>
        `<0x${character.charCodeAt(0).toString(16).padStart(2, '0')}>`,
    )
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return

  const result = spawnSync(
    'taskkill.exe',
    ['/pid', String(child.pid), '/t', '/f'],
    {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 5_000,
    },
  )
  if (!result.error && result.status === 0) return

  try {
    child.kill('SIGKILL')
  } catch {
    // The process may have exited between the taskkill failure and fallback.
  }
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('packaged command broker smoke must run on Windows')
  }

  const binary = path.resolve(process.argv[2] ?? '')
  if (!process.argv[2] || !existsSync(binary)) {
    throw new Error(
      `Freebuff binary not found: ${process.argv[2] ?? '<missing>'}`,
    )
  }

  const outputRoot = path.resolve(
    process.env.CODEBUFF_TERMINAL_SMOKE_OUTPUT_DIR ??
      path.join(process.cwd(), 'debug', 'windows-terminal-broker-smoke'),
  )
  const runDir = path.join(
    outputRoot,
    `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  )
  mkdirSync(runDir, { recursive: true })
  const resultPath = path.join(runDir, 'result.json')
  const readyPath = path.join(runDir, 'broker-ready')
  const reportsSentPath = path.join(runDir, 'reports-sent')
  const transcriptPath = path.join(runDir, 'transcript.bin')
  const visibleTranscriptPath = path.join(runDir, 'transcript.txt')

  const winpty = findWinpty()
  console.log(`terminal-broker-smoke: binary=${binary}`)
  console.log(`terminal-broker-smoke: winpty=${winpty}`)
  console.log(`terminal-broker-smoke: artifacts=${runDir}`)

  const smokeEnv = { ...process.env }
  delete smokeEnv.CODEBUFF_NO_TERMINAL_WATCHDOG
  const child = spawn(
    winpty,
    [
      '-Xallow-non-tty',
      '--',
      binary,
      '--smoke-terminal-broker',
      resultPath,
      runDir,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...smokeEnv,
        CODEBUFF_GITHUB_ACTIONS: 'true',
        NO_COLOR: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  const chunks: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
  child.stderr.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
  // `exit` can precede the final stdout/stderr chunks. The transcript is part
  // of the assertion, so do not inspect it until `close` confirms both pipes
  // have drained.
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code))
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    terminateProcessTree(child)
  }, TIMEOUT_MS)
  try {
    await Promise.race([
      waitFor(
        () => existsSync(readyPath),
        20_000,
        'packaged CLI never reached an active brokered command',
      ),
      closed.then((code) => {
        throw new Error(`packaged CLI exited before report injection (${code})`)
      }),
    ])

    for (let i = 0; i < 40; i++) {
      child.stdin.write(FOCUS_OUT)
      child.stdin.write(DISTINCTIVE_MOUSE_REPORT)
      child.stdin.write(FOCUS_IN)
      await Bun.sleep(5)
    }
    writeFileSync(reportsSentPath, 'sent')

    const exitCode = await closed
    if (timedOut) {
      throw new Error(
        `packaged CLI exceeded the ${TIMEOUT_MS / 1_000}-second acceptance deadline`,
      )
    }
    const transcript = Buffer.concat(chunks)
    writeFileSync(transcriptPath, transcript)
    writeFileSync(visibleTranscriptPath, visibleTranscript(transcript))

    if (!existsSync(resultPath)) {
      throw new Error(`packaged CLI produced no result (exit code ${exitCode})`)
    }
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      ok?: boolean
      error?: string
    }
    if (result.ok !== true) {
      throw new Error(
        `packaged CLI command broker smoke failed (exit code ${exitCode}): ${result.error ?? 'unknown failure'}`,
      )
    }

    const rawTranscript = transcript.toString('utf8')
    const leakedSignature = [
      DISTINCTIVE_MOUSE_REPORT,
      '<35;911;733',
      '^[[<35;911;733',
      FOCUS_IN,
      FOCUS_OUT,
      '^[[I',
      '^[[O',
      'CONSOLE_LEAK_HEX:',
    ].find((signature) => rawTranscript.includes(signature))
    if (leakedSignature) {
      throw new Error(
        `terminal report leaked into packaged CLI output: ${JSON.stringify(leakedSignature)}`,
      )
    }

    if (exitCode !== 0) {
      // Git for Windows' winpty adapter initializes its first size to 80x25,
      // but its later non-TTY resize check uses an uninitialized winsize when
      // ioctl(TIOCGWINSZ) fails. After a successful child exit under GitHub's
      // piped shell, that can trip winpty's zero-size assertion. Accept only
      // that exact wrapper teardown failure after the packaged CLI has written
      // a passing result and its complete transcript has passed the leak scan.
      if (
        exitCode !== 3 ||
        !rawTranscript.includes(WINPTY_ZERO_SIZE_ASSERTION)
      ) {
        throw new Error(`winpty exited unexpectedly with code ${exitCode}`)
      }
      console.warn(
        'terminal-broker-smoke: ignoring winpty zero-size teardown assertion after the packaged CLI passed',
      )
    }

    console.log(
      'terminal-broker-smoke: OK — repeated broker spawns completed, commands had no console, terminal protocols stayed live, overlap/cancellation were independent, and startup failure was actionable.',
    )
  } catch (error) {
    terminateProcessTree(child)
    await Promise.race([closed.catch(() => null), Bun.sleep(2_000)])
    const transcript = Buffer.concat(chunks)
    writeFileSync(transcriptPath, transcript)
    writeFileSync(visibleTranscriptPath, visibleTranscript(transcript))
    console.error(`terminal-broker-smoke: FAIL: ${error}`)
    console.error(`terminal-broker-smoke: result=${resultPath}`)
    console.error(`terminal-broker-smoke: transcript=${visibleTranscriptPath}`)
    if (existsSync(resultPath)) {
      console.error(readFileSync(resultPath, 'utf8'))
    }
    process.exitCode = 1
  } finally {
    clearTimeout(timeout)
    child.stdin.destroy()
    terminateProcessTree(child)
    child.stdout.destroy()
    child.stderr.destroy()
  }
}

void main().catch((error) => {
  console.error(`terminal-broker-smoke: FAIL: ${error}`)
  process.exit(1)
})
