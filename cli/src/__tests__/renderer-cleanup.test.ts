import { spawn } from 'child_process'
import path from 'path'

import { afterEach, describe, expect, test } from 'bun:test'
import stripAnsi from 'strip-ansi'

import { ensureCliTestEnv, isTmuxAvailable, sleep } from './test-utils'

ensureCliTestEnv()

const FIXTURE = path.join(
  import.meta.dir,
  'helpers',
  'renderer-cleanup-fixture.tsx',
)
const LAUNCHER_FIXTURE = path.join(
  import.meta.dir,
  'helpers',
  'launcher-disconnect-fixture.cjs',
)
const tmuxAvailable = isTmuxAvailable()
const sessions: string[] = []

function tmux(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('tmux', args, { stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr))
    })
  })
}

async function runFixture(
  mode:
    | 'clean'
    | 'fatal'
    | 'rejection'
    | 'unprintable-rejection'
    | 'launcher-disconnect'
    | 'sigint'
    | 'sigterm'
    | 'sighup',
): Promise<{
  output: string
  exitCode: number
}> {
  const session = `renderer-cleanup-${mode}-${Date.now()}`
  sessions.push(session)
  await tmux([
    'new-session',
    '-d',
    '-s',
    session,
    '-x',
    '100',
    '-y',
    '20',
    mode === 'launcher-disconnect'
      ? `node ${LAUNCHER_FIXTURE} observe ${FIXTURE}`
      : `bun ${FIXTURE} ${mode}`,
  ])
  await tmux(['set-option', '-t', session, 'remain-on-exit', 'on'])

  let paneDead = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const status = await tmux([
      'display-message',
      '-p',
      '-t',
      session,
      '#{pane_dead} #{pane_dead_status}',
    ])
    if (status.startsWith('1 ')) {
      paneDead = true
      break
    }
    await sleep(50)
  }
  expect(paneDead).toBe(true)

  const status = await tmux([
    'display-message',
    '-p',
    '-t',
    session,
    '#{pane_dead_status}',
  ])
  const output = stripAnsi(await tmux(['capture-pane', '-p', '-t', session]))
  return { output, exitCode: Number(status.trim()) }
}

afterEach(async () => {
  await Promise.all(
    sessions
      .splice(0)
      .map((session) =>
        tmux(['kill-session', '-t', session]).catch(() => undefined),
      ),
  )
})

describe.skipIf(!tmuxAvailable)('renderer cleanup', () => {
  test('clean exit restores the main screen after a frame-active shutdown', async () => {
    const result = await runFixture('clean')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('CLEAN_EXIT_VISIBLE')
    expect(result.output).not.toContain(
      'ALTERNATE_SCREEN_CONTENT_SHOULD_NOT_SURVIVE',
    )
  })

  test('fatal errors remain visible after a frame-active shutdown', async () => {
    const result = await runFixture('fatal')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('fatal-cleanup-fixture')
    expect(result.output).not.toContain(
      'ALTERNATE_SCREEN_CONTENT_SHOULD_NOT_SURVIVE',
    )
  })

  test('unhandled rejections remain visible after a frame-active shutdown', async () => {
    const result = await runFixture('rejection')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('rejection-cleanup-fixture')
    expect(result.output).not.toContain(
      'ALTERNATE_SCREEN_CONTENT_SHOULD_NOT_SURVIVE',
    )
  })

  test('unprintable rejection reasons cannot break fatal cleanup', async () => {
    const result = await runFixture('unprintable-rejection')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('Unhandled rejection: <unprintable error>')
    expect(result.output).not.toContain(
      'ALTERNATE_SCREEN_CONTENT_SHOULD_NOT_SURVIVE',
    )
  })

  test('launcher death restores the main screen and exits the orphaned CLI', async () => {
    const result = await runFixture('launcher-disconnect')

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('CLEAN_EXIT_VISIBLE')
    expect(result.output).toContain('CLI_EXITED_AFTER_LAUNCHER')
    expect(result.output).not.toContain(
      'ALTERNATE_SCREEN_CONTENT_SHOULD_NOT_SURVIVE',
    )
  })

  for (const mode of ['sigint', 'sigterm', 'sighup'] as const) {
    test(`${mode.toUpperCase()} restores the main screen during an active frame`, async () => {
      const result = await runFixture(mode)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('CLEAN_EXIT_VISIBLE')
      expect(result.output).not.toContain(
        'ALTERNATE_SCREEN_CONTENT_SHOULD_NOT_SURVIVE',
      )
    })
  }
})
