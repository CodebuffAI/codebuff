import { describe, expect, test } from 'bun:test'

import {
  formatFreebuffSessionCountdown,
  formatFreebuffSessionRemaining,
} from '../freebuff-session-display'

describe('freebuff session display formatting', () => {
  test('formats urgent countdowns', () => {
    expect(formatFreebuffSessionCountdown(61_000)).toBe('1:01')
    expect(formatFreebuffSessionRemaining(61_000)).toBe('1:01 left')
  })

  test('formats minute and hour remaining labels', () => {
    expect(formatFreebuffSessionRemaining(5 * 60_000)).toBe('5m left')
    expect(formatFreebuffSessionRemaining(60 * 60_000)).toBe('1h left')
    expect(formatFreebuffSessionRemaining(90 * 60_000)).toBe('1h 30m left')
  })

  test('formats expired sessions as expiring', () => {
    expect(formatFreebuffSessionRemaining(0)).toBe('expiring…')
  })
})
