import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'

import { createMockTimers } from '@codebuff/common/testing/mocks/timers'
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import {
  clearClipboardMessage,
  copyTextToClipboard,
  LINUX_CLIPBOARD_ERROR_MESSAGE,
  LINUX_OSC52_ONLY_MESSAGE,
  OSC52_UNVERIFIED_MESSAGE,
  registerClipboardRenderer,
  REMOTE_CLIPBOARD_ERROR_MESSAGE,
  subscribeClipboardMessages,
  unregisterClipboardRenderer,
} from '../clipboard'
import { logger } from '../logger'

import type { ChildProcess } from 'node:child_process'
import type { MockTimers } from '@codebuff/common/testing/mocks/timers'

type SpawnSyncResult = ReturnType<
  typeof import('node:child_process').spawnSync
>

interface FakeClipboardProcess {
  child: ChildProcess
  close: (code: number) => void
  input: () => string
  killSignals: string[]
}

function fakeClipboardProcess(): FakeClipboardProcess {
  let input = ''
  const killSignals: string[] = []
  const child = new EventEmitter() as ChildProcess
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString()
      callback()
    },
  })
  child.kill = ((signal = 'SIGTERM') => {
    killSignals.push(String(signal))
    return true
  }) as ChildProcess['kill']

  return {
    child,
    close: (code) => child.emit('close', code, null),
    input: () => input,
    killSignals,
  }
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('copyTextToClipboard - Linux platform tools', () => {
  let childProcess: typeof import('node:child_process')
  let spawnSpy: ReturnType<typeof spyOn>
  let loggerErrorSpy: ReturnType<typeof spyOn>
  let mockTimers: MockTimers
  let originalPlatform: PropertyDescriptor | undefined
  let originalEnv: Record<string, string | undefined>
  let attempts: {
    command: string
    args: string[]
    process: FakeClipboardProcess
  }[]

  beforeEach(async () => {
    childProcess = await import('node:child_process')
    spawnSpy = spyOn(childProcess, 'spawn')
    loggerErrorSpy = spyOn(logger, 'error').mockImplementation(() => {})
    mockTimers = createMockTimers()
    mockTimers.install()
    attempts = []
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    originalEnv = {
      WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
      SSH_CLIENT: process.env.SSH_CLIENT,
      SSH_TTY: process.env.SSH_TTY,
      SSH_CONNECTION: process.env.SSH_CONNECTION,
      TERM: process.env.TERM,
    }

    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    })
    delete process.env.SSH_CLIENT
    delete process.env.SSH_TTY
    delete process.env.SSH_CONNECTION
    process.env.TERM = 'dumb'
    clearClipboardMessage()
    unregisterClipboardRenderer()
  })

  afterEach(() => {
    mockTimers.restore()
    spawnSpy.mockRestore()
    loggerErrorSpy.mockRestore()
    unregisterClipboardRenderer()
    clearClipboardMessage()
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  function mockBackends(statusFor: (command: string) => number | null) {
    spawnSpy.mockImplementation((command: string, args: readonly string[]) => {
      const process = fakeClipboardProcess()
      attempts.push({ command, args: [...args], process })
      const status = statusFor(command)
      if (status !== null) {
        queueMicrotask(() => process.close(status))
      }
      return process.child
    })
  }

  test('prefers wl-copy in a Wayland session', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends(() => 0)
    let fallbackCalls = 0

    await copyTextToClipboard('hello', {
      suppressGlobalMessage: true,
      getOsc52Fallback: () => {
        fallbackCalls++
        return { text: 'fallback' }
      },
    })

    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.command).toBe('wl-copy')
    expect(attempts[0]?.args).toEqual(['--type', 'text/plain'])
    expect(attempts[0]?.process.input()).toBe('hello')
    expect(fallbackCalls).toBe(0)
  })

  test('falls back from wl-copy through the X11 tools in order', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends((command) => (command === 'xsel' ? 0 : 1))

    await copyTextToClipboard('hello', { suppressGlobalMessage: true })

    expect(attempts.map(({ command }) => command)).toEqual([
      'wl-copy',
      'xclip',
      'xsel',
    ])
    expect(attempts.every(({ process }) => process.input() === 'hello')).toBe(
      true,
    )
  })

  test('a hanging backend does not block timers and is killed before fallback', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends((command) => (command === 'wl-copy' ? null : 0))

    const copyPromise = copyTextToClipboard('hello', {
      suppressGlobalMessage: true,
    })
    await flushMicrotasks()
    expect(attempts.map(({ command }) => command)).toEqual(['wl-copy'])

    let uiTimerRan = false
    setTimeout(() => {
      uiTimerRan = true
    }, 1)
    mockTimers.advanceBy(1)
    expect(uiTimerRan).toBe(true)
    expect(attempts.map(({ command }) => command)).toEqual(['wl-copy'])

    mockTimers.advanceBy(4999)
    await copyPromise

    expect(attempts.map(({ command }) => command)).toEqual(['wl-copy', 'xclip'])
    expect(attempts[0]?.process.killSignals).toEqual(['SIGKILL'])
  })

  test('uses OSC 52 after a native timeout and failed native fallbacks', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    process.env.TERM = 'xterm-256color'
    mockBackends((command) => (command === 'wl-copy' ? null : 1))
    const rendererCalls: string[] = []
    registerClipboardRenderer({
      copyToClipboardOSC52: (text: string) => {
        rendererCalls.push(text)
        return true
      },
    })

    const copyPromise = copyTextToClipboard('hello', {
      suppressGlobalMessage: true,
    })
    mockTimers.advanceBy(5000)
    await copyPromise

    expect(attempts.map(({ command }) => command)).toEqual([
      'wl-copy',
      'xclip',
      'xsel',
    ])
    expect(rendererCalls).toEqual(['hello'])
  })

  // Support email 2026-09-26: on a Chromebook "it says copied but never
  // copies". Its Linux terminal has no wl-copy/xclip, so only OSC 52 ran, and
  // nothing can confirm the terminal honoured it.
  test('a copy that only reached the terminal says so and how to fix it', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    process.env.TERM = 'xterm-256color'
    mockBackends(() => 1) // no native tool works
    registerClipboardRenderer({ copyToClipboardOSC52: () => true })
    const messages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((m) => messages.push(m))

    const result = await copyTextToClipboard('hello', {
      suppressGlobalMessage: true,
      successMessage: 'Copied!',
      durationMs: 3000,
    })

    expect(result).toBe('unverified')
    expect(messages.at(-1)).toBe(LINUX_OSC52_ONLY_MESSAGE)
    mockTimers.advanceBy(5999)
    expect(messages.at(-1)).toBe(LINUX_OSC52_ONLY_MESSAGE)
    mockTimers.advanceBy(1)
    expect(messages.at(-1)).toBeNull()
    unsubscribe()
  })

  // Over SSH the clipboard to reach belongs to the machine running the
  // terminal, so OSC 52 is the only route and a package on this host cannot
  // help — neither as guidance after a copy nor as advice after a failure.
  test('an SSH copy is unconfirmed without naming a local clipboard tool', async () => {
    process.env.SSH_TTY = '/dev/pts/0'
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends(() => 1)
    registerClipboardRenderer({ copyToClipboardOSC52: () => true })
    const messages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((m) => messages.push(m))

    const result = await copyTextToClipboard('hello', {
      suppressGlobalMessage: true,
      successMessage: 'Copied!',
    })

    expect(result).toBe('unverified')
    expect(messages.at(-1)).toBe(OSC52_UNVERIFIED_MESSAGE)
    expect(messages.at(-1)).not.toBe(LINUX_OSC52_ONLY_MESSAGE)
    // A native tool is never even reached: OSC 52 runs first over SSH.
    expect(attempts).toEqual([])
    unsubscribe()
  })

  test('an SSH failure is not told to install a local clipboard tool', async () => {
    process.env.SSH_TTY = '/dev/pts/0'
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends(() => 1) // no native tool works, and TERM=dumb blocks OSC 52
    const messages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((m) => messages.push(m))

    await expect(copyTextToClipboard('hello')).rejects.toThrow(
      'No clipboard method available',
    )

    expect(messages).toContain(REMOTE_CLIPBOARD_ERROR_MESSAGE)
    expect(messages).not.toContain(LINUX_CLIPBOARD_ERROR_MESSAGE)
    unsubscribe()
  })

  test('a native tool copy keeps the plain message', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends(() => 0)
    const messages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((m) => messages.push(m))

    await copyTextToClipboard('hello')

    expect(messages.at(-1)).toBe('Copied: "hello"')
    unsubscribe()
  })

  test('aborting a hanging backend kills it without running stale fallbacks', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    process.env.TERM = 'xterm-256color'
    mockBackends(() => null)
    const rendererCalls: string[] = []
    registerClipboardRenderer({
      copyToClipboardOSC52: (text: string) => {
        rendererCalls.push(text)
        return true
      },
    })
    const controller = new AbortController()

    const copyPromise = copyTextToClipboard('stale selection', {
      signal: controller.signal,
    })
    await flushMicrotasks()
    controller.abort()

    await expect(copyPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(attempts.map(({ command }) => command)).toEqual(['wl-copy'])
    expect(attempts[0]?.process.killSignals).toEqual(['SIGKILL'])
    expect(rendererCalls).toEqual([])
    expect(mockTimers.getPendingCount()).toBe(0)
    expect(loggerErrorSpy).not.toHaveBeenCalled()
  })

  test('a newer copy cancels an older hanging copy across callers', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    let wlCopyAttempts = 0
    mockBackends((command) => {
      if (command !== 'wl-copy') return 0
      wlCopyAttempts++
      return wlCopyAttempts === 1 ? null : 0
    })

    const staleCopy = copyTextToClipboard('stale selection', {
      suppressGlobalMessage: true,
    })
    await flushMicrotasks()
    const freshCopy = copyTextToClipboard('fresh selection', {
      suppressGlobalMessage: true,
    })

    await expect(staleCopy).rejects.toMatchObject({ name: 'AbortError' })
    await freshCopy
    expect(attempts.map(({ command }) => command)).toEqual([
      'wl-copy',
      'wl-copy',
    ])
    expect(attempts[0]?.process.killSignals).toEqual(['SIGKILL'])
    expect(attempts[1]?.process.input()).toBe('fresh selection')
    expect(loggerErrorSpy).not.toHaveBeenCalled()
  })

  test('cancellation wins if an older backend closes before its continuation runs', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    let wlCopyAttempts = 0
    mockBackends((command) => {
      if (command !== 'wl-copy') return 0
      wlCopyAttempts++
      return wlCopyAttempts === 1 ? null : 0
    })

    const staleCopy = copyTextToClipboard('stale selection', {
      suppressGlobalMessage: true,
    })
    attempts[0]?.process.close(0)
    const freshCopy = copyTextToClipboard('fresh selection', {
      suppressGlobalMessage: true,
    })

    await expect(staleCopy).rejects.toMatchObject({ name: 'AbortError' })
    await freshCopy
    expect(attempts.map(({ process }) => process.input())).toEqual([
      'stale selection',
      'fresh selection',
    ])
  })

  test('prefers xclip when Wayland is not active', async () => {
    delete process.env.WAYLAND_DISPLAY
    mockBackends(() => 0)

    await copyTextToClipboard('hello', { suppressGlobalMessage: true })

    expect(attempts.map(({ command }) => command)).toEqual(['xclip'])
  })

  // Discord #⚠️-help, 2026-10-13: "I selected text, got 'copied to clipboard'
  // and could paste it into an editor. This has stopped working." A Wayland
  // session does not always carry WAYLAND_DISPLAY into its processes (tmux's
  // default `update-environment` omits it), and a Wayland-only box ships
  // wl-clipboard and no xclip. Gating wl-copy on the variable made the only
  // working tool unreachable, so the copy fell through to fire-and-forget
  // OSC 52 and claimed a success the clipboard never received.
  test('still reaches wl-copy when WAYLAND_DISPLAY is not inherited', async () => {
    delete process.env.WAYLAND_DISPLAY
    process.env.TERM = 'xterm-256color'
    mockBackends((command) => (command === 'wl-copy' ? 0 : 1))
    registerClipboardRenderer({ copyToClipboardOSC52: () => true })
    const messages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((m) => messages.push(m))

    const result = await copyTextToClipboard('hello')

    expect(attempts.map(({ command }) => command)).toEqual([
      'xclip',
      'xsel',
      'wl-copy',
    ])
    expect(attempts.at(-1)?.process.input()).toBe('hello')
    // A native tool confirmed the write, so this is a real copy: no OSC 52
    // guidance, and the caller is not told the result is unverified.
    expect(result).toBeUndefined()
    expect(messages.at(-1)).toBe('Copied: "hello"')
    expect(messages).not.toContain(LINUX_OSC52_ONLY_MESSAGE)
    unsubscribe()
  })

  test('an X11 session only pays for wl-copy once nothing else worked', async () => {
    delete process.env.WAYLAND_DISPLAY
    mockBackends((command) => (command === 'xsel' ? 0 : 1))

    await copyTextToClipboard('hello', { suppressGlobalMessage: true })

    expect(attempts.map(({ command }) => command)).toEqual(['xclip', 'xsel'])
  })

  test('shows an actionable error when no Linux backend is available', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends(() => 1)
    const messages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((message) =>
      messages.push(message),
    )

    await expect(copyTextToClipboard('hello')).rejects.toThrow(
      'No clipboard method available',
    )

    expect(messages).toContain(LINUX_CLIPBOARD_ERROR_MESSAGE)
    unsubscribe()
  })

  test('uses a bounded OSC 52 fallback after native tools reject the full text', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    mockBackends(() => 1)
    const rendererCalls: string[] = []
    registerClipboardRenderer({
      copyToClipboardOSC52: (text: string) => {
        rendererCalls.push(text)
        return true
      },
    })
    const messages: (string | null)[] = []
    const unsubscribe = subscribeClipboardMessages((message) =>
      messages.push(message),
    )

    await copyTextToClipboard('x'.repeat(24_001), {
      successMessage: 'Copied full text',
      getOsc52Fallback: () => ({
        text: 'bounded text',
        successMessage: 'Copied bounded text',
      }),
    })

    expect(rendererCalls).toEqual(['bounded text'])
    expect(messages).toContain(
      `Text shortened to fit the terminal. ${LINUX_OSC52_ONLY_MESSAGE}`,
    )
    expect(messages.some((m) => m?.startsWith('Copied full text'))).toBe(false)
    unsubscribe()
  })

  test('accepts an OSC 52 payload exactly at the 32 KB base64 limit', async () => {
    mockBackends(() => 1)
    const rendererCalls: string[] = []
    registerClipboardRenderer({
      copyToClipboardOSC52: (text: string) => {
        rendererCalls.push(text)
        return true
      },
    })
    const text = 'x'.repeat(24_000)

    await copyTextToClipboard(text, { suppressGlobalMessage: true })

    expect(rendererCalls).toEqual([text])
  })
})

// The paste side of the same report. `readClipboardText` is what Ctrl+V reads
// (use-chat-keyboard.ts) and what the text-only composers fall back to when a
// terminal sends no bracketed paste.
describe('readClipboardText - Linux readers', () => {
  let childProcess: typeof import('node:child_process')
  let spawnSyncSpy: ReturnType<typeof spyOn>
  let originalPlatform: PropertyDescriptor | undefined
  let reads: { command: string; args: string[] }[]

  beforeEach(async () => {
    childProcess = await import('node:child_process')
    spawnSyncSpy = spyOn(childProcess, 'spawnSync')
    reads = []
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    })
  })

  afterEach(() => {
    spawnSyncSpy.mockRestore()
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  })

  function fakeSpawnSyncResult(
    status: number,
    stdout: string,
  ): SpawnSyncResult {
    return {
      pid: 1,
      output: [null, stdout, ''],
      stdout,
      stderr: '',
      status,
      signal: null,
    }
  }

  function mockReaders(outputFor: (command: string) => string | null) {
    spawnSyncSpy.mockImplementation(
      (command: string, args: readonly string[]) => {
        reads.push({ command, args: [...args] })
        const stdout = outputFor(command)
        return stdout === null
          ? fakeSpawnSyncResult(1, '')
          : fakeSpawnSyncResult(0, stdout)
      },
    )
  }

  test('falls through xclip and xsel to wl-paste', async () => {
    const { readClipboardText } = await import('../clipboard-image')
    mockReaders((command) => (command === 'wl-paste' ? 'pasted text\n' : null))

    expect(readClipboardText()).toBe('pasted text')
    expect(reads.map(({ command }) => command)).toEqual([
      'xclip',
      'xsel',
      'wl-paste',
    ])
    // Asking for text/plain keeps an image-only clipboard from dumping binary
    // bytes into the composer.
    expect(reads.at(-1)?.args).toContain('text/plain')
  })

  test('stops at the first reader that returns text', async () => {
    const { readClipboardText } = await import('../clipboard-image')
    mockReaders(() => 'from xclip')

    expect(readClipboardText()).toBe('from xclip')
    expect(reads.map(({ command }) => command)).toEqual(['xclip'])
  })

  test('returns null when no reader works', async () => {
    const { readClipboardText } = await import('../clipboard-image')
    mockReaders(() => null)

    expect(readClipboardText()).toBeNull()
    expect(reads).toHaveLength(3)
  })
})
