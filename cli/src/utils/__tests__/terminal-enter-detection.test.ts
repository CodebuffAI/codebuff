import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  isLinefeedActingAsEnter,
  isPlainEnterKey,
  markReturnKeySeenForKey,
  resetReturnKeySeenForTests,
  shouldMarkReturnKeySeen,
} from '../terminal-enter-detection'

describe('terminal enter detection', () => {
  beforeEach(() => {
    resetReturnKeySeenForTests(false)
  })

  afterEach(() => {
    resetReturnKeySeenForTests()
  })

  test('marks real carriage-return Enter as return seen', () => {
    expect(shouldMarkReturnKeySeen({ name: 'return', sequence: '\r' })).toBe(
      true,
    )

    markReturnKeySeenForKey({ name: 'return', sequence: '\r' })

    expect(isLinefeedActingAsEnter()).toBe(false)
  })

  test('marks Kitty CSI-u Return as return seen', () => {
    expect(
      shouldMarkReturnKeySeen({ name: 'return', sequence: '\x1b[13u' }),
    ).toBe(true)

    markReturnKeySeenForKey({ name: 'return', sequence: '\x1b[13u' })

    expect(isLinefeedActingAsEnter()).toBe(false)
  })

  test('does not mark keypad Enter escape sequences as return seen', () => {
    expect(
      shouldMarkReturnKeySeen({ name: 'kpenter', sequence: '\x1b[57414u' }),
    ).toBe(false)
    expect(shouldMarkReturnKeySeen({ name: '', sequence: '\x1bOM' })).toBe(
      false,
    )

    markReturnKeySeenForKey({ name: 'kpenter', sequence: '\x1b[57414u' })
    markReturnKeySeenForKey({ name: '', sequence: '\x1bOM' })

    expect(isLinefeedActingAsEnter()).toBe(true)
  })

  test('recognizes keypad Enter as plain Enter', () => {
    expect(
      isPlainEnterKey({ name: 'kpenter', sequence: '\x1b[57414u' }),
    ).toBe(true)
    expect(isPlainEnterKey({ name: '', sequence: '\x1bOM' })).toBe(true)
  })

  test('plain Enter detection records return before later linefeed checks', () => {
    expect(isLinefeedActingAsEnter()).toBe(true)
    expect(isPlainEnterKey({ name: 'return', sequence: '\r' })).toBe(true)
    expect(isLinefeedActingAsEnter()).toBe(false)
    expect(isPlainEnterKey({ name: 'linefeed', sequence: '\n' })).toBe(false)
  })

  test('does not recognize modified keypad Enter as plain Enter', () => {
    expect(
      isPlainEnterKey({
        name: 'kpenter',
        sequence: '\x1b[57414u',
        shift: true,
      }),
    ).toBe(false)
  })
})
