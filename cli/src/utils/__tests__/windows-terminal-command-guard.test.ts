import { describe, expect, test } from 'bun:test'

import { installWindowsTerminalCommandGuard } from '../windows-terminal-command-guard'

function createFixture() {
  let listener: ((active: boolean) => void) | null = null
  const mouseStates: boolean[] = []
  const controlWrites: string[] = []
  let mouseEnabled = true
  let inputHandler: ((sequence: string) => boolean) | null = null

  const renderer = {
    isDestroyed: false,
    get useMouse() {
      return mouseEnabled
    },
    set useMouse(enabled: boolean) {
      mouseEnabled = enabled
      mouseStates.push(enabled)
    },
    prependInputHandler(handler: (sequence: string) => boolean) {
      inputHandler = handler
    },
    removeInputHandler(handler: (sequence: string) => boolean) {
      if (inputHandler === handler) inputHandler = null
    },
  }

  const cleanup = installWindowsTerminalCommandGuard(renderer, {
    platform: 'win32',
    subscribe: (nextListener) => {
      listener = nextListener
      nextListener(false)
      return () => {
        listener = null
      }
    },
    writeControl: (sequence) => controlWrites.push(sequence),
  })

  const reportCommandState = (active: boolean) => {
    if (!listener) throw new Error('Guard listener is not installed')
    listener(active)
  }

  return {
    renderer,
    mouseStates,
    controlWrites,
    reportCommandState,
    dispatchInput: (sequence: string) => inputHandler?.(sequence) ?? false,
    hasInputHandler: () => inputHandler !== null,
    cleanup,
  }
}

describe('installWindowsTerminalCommandGuard', () => {
  test('disables reports before a command and restores them afterward', () => {
    const fixture = createFixture()

    fixture.reportCommandState(true)
    expect(fixture.renderer.useMouse).toBe(false)
    expect(fixture.mouseStates).toEqual([false])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])

    fixture.reportCommandState(false)
    expect(fixture.renderer.useMouse).toBe(true)
    expect(fixture.mouseStates).toEqual([false, true])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l', '\x1b[?1004h'])

    fixture.cleanup()
  })

  test('ignores duplicate active notifications', () => {
    const fixture = createFixture()

    fixture.reportCommandState(true)
    fixture.reportCommandState(true)

    expect(fixture.mouseStates).toEqual([false])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])

    fixture.reportCommandState(false)
    expect(fixture.mouseStates).toEqual([false, true])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l', '\x1b[?1004h'])

    fixture.cleanup()
  })

  test('blocks OpenTUI focus-mode restoration only while guarded', () => {
    const fixture = createFixture()

    expect(fixture.dispatchInput('\x1b[I')).toBe(false)
    fixture.reportCommandState(true)
    expect(fixture.dispatchInput('\x1b[I')).toBe(true)
    expect(fixture.dispatchInput('\x1b[O')).toBe(true)
    expect(fixture.dispatchInput('\x1b[A')).toBe(false)
    fixture.reportCommandState(false)
    expect(fixture.dispatchInput('\x1b[I')).toBe(false)

    fixture.cleanup()
    expect(fixture.hasInputHandler()).toBe(false)
  })

  test('does nothing outside Windows', () => {
    let subscribed = false
    const renderer = {
      isDestroyed: false,
      useMouse: true,
      prependInputHandler: () => {},
      removeInputHandler: () => {},
    }

    const cleanup = installWindowsTerminalCommandGuard(renderer, {
      platform: 'linux',
      subscribe: () => {
        subscribed = true
        return () => {}
      },
    })

    expect(subscribed).toBe(false)
    expect(renderer.useMouse).toBe(true)
    cleanup()
  })
})
