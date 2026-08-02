import { describe, expect, test } from 'bun:test'

import {
  installTerminalProtocolController,
  TerminalProtocolController,
} from '../terminal-protocol-controller'

function createFixture(options: { writeSucceeds?: boolean } = {}) {
  const controlWrites: string[] = []
  const errors: unknown[] = []
  let inputHandler: ((sequence: string) => boolean) | null = null
  const renderer = {
    prependInputHandler(handler: (sequence: string) => boolean) {
      inputHandler = handler
    },
    removeInputHandler(handler: (sequence: string) => boolean) {
      if (inputHandler === handler) inputHandler = null
    },
  }
  const controller = new TerminalProtocolController(renderer, {
    writeControl: (sequence) => {
      controlWrites.push(sequence)
      return options.writeSucceeds ?? true
    },
    onError: (error) => errors.push(error),
  })

  return {
    renderer,
    controller,
    controlWrites,
    errors,
    dispatchInput: (sequence: string) => inputHandler?.(sequence) ?? false,
    hasInputHandler: () => inputHandler !== null,
  }
}

describe('TerminalProtocolController', () => {
  test('enables focus reporting for the first subscriber and disables it for the last', () => {
    const fixture = createFixture()
    const first = fixture.controller.subscribeToFocus({
      onFocusChange: () => {},
    })
    const second = fixture.controller.subscribeToFocus({
      onFocusChange: () => {},
    })

    expect(fixture.controlWrites).toEqual(['\x1b[?1004h'])
    first()
    expect(fixture.controlWrites).toEqual(['\x1b[?1004h'])
    second()
    expect(fixture.controlWrites).toEqual(['\x1b[?1004h', '\x1b[?1004l'])
  })

  test('parses focus activity without consuming unrelated or focus input', () => {
    const fixture = createFixture()
    const focusStates: boolean[] = []
    let supportDetections = 0
    fixture.controller.subscribeToFocus({
      onFocusChange: (focused) => focusStates.push(focused),
      onSupportDetected: () => supportDetections++,
    })

    expect(fixture.dispatchInput('\x1b[O')).toBe(false)
    expect(fixture.dispatchInput('\x1b[I')).toBe(false)
    expect(fixture.dispatchInput('\x1b[I')).toBe(false)
    expect(fixture.dispatchInput('\x1b[A')).toBe(false)
    expect(focusStates).toEqual([false, true])
    expect(supportDetections).toBe(1)
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

  test('reports control-write failures without breaking subscriptions', () => {
    const fixture = createFixture({ writeSucceeds: false })
    const unsubscribe = fixture.controller.subscribeToFocus({
      onFocusChange: () => {},
    })
    unsubscribe()

    expect(fixture.controlWrites).toEqual(['\x1b[?1004h', '\x1b[?1004l'])
    expect(fixture.errors).toHaveLength(2)
  })

  test('disposal removes the input handler and makes late cleanup inert', () => {
    const fixture = createFixture()
    const unsubscribe = fixture.controller.subscribeToFocus({
      onFocusChange: () => {},
    })
    fixture.controller.dispose()
    unsubscribe()

    expect(fixture.hasInputHandler()).toBe(false)
    expect(fixture.controlWrites).toEqual(['\x1b[?1004h'])
  })

  test('allows only one installed controller at a time', () => {
    const fixture = createFixture()
    fixture.controller.dispose()
    const controller = installTerminalProtocolController(fixture.renderer)
    expect(() => installTerminalProtocolController(fixture.renderer)).toThrow(
      'already installed',
    )
    controller.dispose()
  })
})
