import { describe, expect, test } from 'bun:test'

import {
  installTerminalProtocolController,
  terminalCommandIsolation,
  TerminalProtocolController,
} from '../terminal-protocol-controller'

function createFixture(
  options: { writeSucceeds?: boolean; throwOnMouseReadOnce?: boolean } = {},
) {
  const mouseStates: boolean[] = []
  const controlWrites: string[] = []
  const errors: unknown[] = []
  let mouseEnabled = true
  let throwOnMouseRead = options.throwOnMouseReadOnce ?? false
  let inputHandler: ((sequence: string) => boolean) | null = null

  const renderer = {
    isDestroyed: false,
    get useMouse() {
      if (throwOnMouseRead) {
        throwOnMouseRead = false
        throw new Error('mouse state unavailable')
      }
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

  const controller = new TerminalProtocolController(renderer, {
    platform: 'win32',
    writeControl: (sequence) => {
      controlWrites.push(sequence)
      return options.writeSucceeds ?? true
    },
    onError: (error) => errors.push(error),
  })

  return {
    renderer,
    controller,
    mouseStates,
    controlWrites,
    errors,
    dispatchInput: (sequence: string) => inputHandler?.(sequence) ?? false,
    hasInputHandler: () => inputHandler !== null,
  }
}

describe('TerminalProtocolController', () => {
  test('nests command leases and restores protocols after the final release', () => {
    const fixture = createFixture()

    const releaseFirst = fixture.controller.acquireTerminalCommand()
    const releaseSecond = fixture.controller.acquireTerminalCommand()
    expect(fixture.renderer.useMouse).toBe(false)
    expect(fixture.mouseStates).toEqual([false])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])

    releaseFirst()
    releaseFirst()
    expect(fixture.renderer.useMouse).toBe(false)
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])

    releaseSecond()
    expect(fixture.renderer.useMouse).toBe(true)
    expect(fixture.mouseStates).toEqual([false, true])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])
  })

  test('keeps focus detection live while blocking OpenTUI mode restoration', () => {
    const fixture = createFixture()
    const focusStates: boolean[] = []
    let supportDetections = 0
    const unsubscribe = fixture.controller.subscribeToFocus({
      onFocusChange: (focused) => focusStates.push(focused),
      onSupportDetected: () => supportDetections++,
    })

    expect(fixture.dispatchInput('\x1b[O')).toBe(false)
    const release = fixture.controller.acquireTerminalCommand()
    expect(fixture.dispatchInput('\x1b[I')).toBe(true)
    expect(fixture.dispatchInput('\x1b[I')).toBe(true)
    expect(fixture.dispatchInput('\x1b[A')).toBe(false)
    expect(focusStates).toEqual([false, true])
    expect(supportDetections).toBe(1)
    expect(fixture.controlWrites).toEqual(['\x1b[?1004h', '\x1b[?1004l'])

    release()
    expect(fixture.dispatchInput('\x1b[O')).toBe(false)
    expect(focusStates).toEqual([false, true, false])
    expect(fixture.controlWrites).toEqual([
      '\x1b[?1004h',
      '\x1b[?1004l',
      '\x1b[?1004h',
    ])
    unsubscribe()
    expect(fixture.controlWrites.at(-1)).toBe('\x1b[?1004l')
  })

  test('replays detected focus state to a late subscriber', () => {
    const fixture = createFixture()
    fixture.dispatchInput('\x1b[O')
    const focusStates: boolean[] = []
    let supportDetections = 0

    fixture.controller.subscribeToFocus({
      onFocusChange: (focused) => focusStates.push(focused),
      onSupportDetected: () => supportDetections++,
    })

    expect(focusStates).toEqual([false])
    expect(supportDetections).toBe(1)
  })

  test('does not re-enable focus when the last subscriber leaves mid-command', () => {
    const fixture = createFixture()
    const unsubscribe = fixture.controller.subscribeToFocus({
      onFocusChange: () => {},
    })
    const release = fixture.controller.acquireTerminalCommand()

    unsubscribe()
    release()

    expect(fixture.controlWrites).toEqual(['\x1b[?1004h', '\x1b[?1004l'])
  })

  test('enables focus after a subscriber arrives mid-command', () => {
    const fixture = createFixture()
    const release = fixture.controller.acquireTerminalCommand()
    fixture.controller.subscribeToFocus({ onFocusChange: () => {} })

    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])
    release()
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l', '\x1b[?1004h'])
  })

  test('fails closed and rolls back mouse state when isolation cannot be written', () => {
    const fixture = createFixture({ writeSucceeds: false })

    expect(() => fixture.controller.acquireTerminalCommand()).toThrow(
      'Restart Freebuff in Windows Terminal or the VS Code terminal',
    )
    expect(fixture.renderer.useMouse).toBe(true)
    expect(fixture.mouseStates).toEqual([false, true])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])
  })

  test('restores requested focus reporting after isolation acquisition fails', () => {
    const fixture = createFixture()
    fixture.controller.subscribeToFocus({ onFocusChange: () => {} })
    let disableAttempted = false
    const writes: string[] = []
    const renderer = fixture.renderer
    fixture.controller.dispose()
    const controller = new TerminalProtocolController(renderer, {
      platform: 'win32',
      writeControl: (sequence) => {
        writes.push(sequence)
        if (sequence === '\x1b[?1004l' && !disableAttempted) {
          disableAttempted = true
          return false
        }
        return true
      },
    })
    controller.subscribeToFocus({ onFocusChange: () => {} })
    writes.length = 0

    expect(() => controller.acquireTerminalCommand()).toThrow(
      'Restart Freebuff in Windows Terminal or the VS Code terminal',
    )
    expect(writes).toEqual(['\x1b[?1004l', '\x1b[?1004h'])
    expect(renderer.useMouse).toBe(true)
  })

  test('recovers its lease depth when reading renderer state fails', () => {
    const fixture = createFixture({ throwOnMouseReadOnce: true })

    expect(() => fixture.controller.acquireTerminalCommand()).toThrow(
      'mouse state unavailable',
    )
    const release = fixture.controller.acquireTerminalCommand()
    expect(fixture.renderer.useMouse).toBe(false)
    release()
    expect(fixture.renderer.useMouse).toBe(true)
  })

  test('does not restore protocols after renderer teardown', () => {
    const fixture = createFixture()
    const release = fixture.controller.acquireTerminalCommand()
    fixture.renderer.isDestroyed = true
    fixture.controller.dispose()

    release()
    expect(fixture.mouseStates).toEqual([false])
    expect(fixture.controlWrites).toEqual(['\x1b[?1004l'])
    expect(fixture.hasInputHandler()).toBe(false)
  })

  test('late subscriber cleanup does not write after controller disposal', () => {
    const fixture = createFixture()
    const unsubscribe = fixture.controller.subscribeToFocus({
      onFocusChange: () => {},
    })
    expect(fixture.controlWrites).toEqual(['\x1b[?1004h'])

    fixture.controller.dispose()
    unsubscribe()

    expect(fixture.controlWrites).toEqual(['\x1b[?1004h'])
  })

  test('leaves protocols untouched outside Windows while still parsing focus', () => {
    const fixture = createFixture()
    const linuxController = new TerminalProtocolController(fixture.renderer, {
      platform: 'linux',
      writeControl: (sequence) => {
        fixture.controlWrites.push(sequence)
        return true
      },
    })

    const release = linuxController.acquireTerminalCommand()
    release()
    expect(fixture.mouseStates).toEqual([])
    expect(fixture.controlWrites).toEqual([])
    linuxController.dispose()
  })

  test('the exported capability delegates platform policy to the installed controller', () => {
    const fixture = createFixture()
    fixture.controller.dispose()
    const controller = installTerminalProtocolController(fixture.renderer, {
      platform: 'win32',
      writeControl: (sequence) => {
        fixture.controlWrites.push(sequence)
        return true
      },
    })

    const release = terminalCommandIsolation.acquire()
    expect(fixture.renderer.useMouse).toBe(false)
    release()
    expect(fixture.renderer.useMouse).toBe(true)
    controller.dispose()
  })
})
