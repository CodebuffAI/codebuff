import { describe, test, expect } from 'bun:test'

import { computeHasStatus } from '../status-indicator'

const createTimer = (startTime: number | null) => ({
  start: () => {},
  stop: () => {},
  elapsedSeconds: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
  startTime,
})

describe('computeHasStatus', () => {
  test('returns true when connection is lost', () => {
    expect(
      computeHasStatus({
        isConnected: false,
        isActive: false,
        clipboardMessage: null,
        timer: createTimer(null),
      }),
    ).toBe(true)
  })

  test('returns true when active', () => {
    expect(
      computeHasStatus({
        isConnected: true,
        isActive: true,
        clipboardMessage: null,
        timer: createTimer(null),
      }),
    ).toBe(true)
  })

  test('returns true when clipboard message exists', () => {
    expect(
      computeHasStatus({
        isConnected: true,
        isActive: false,
        clipboardMessage: 'Copied!',
        timer: createTimer(null),
      }),
    ).toBe(true)
  })

  test('returns true when timer has started', () => {
    expect(
      computeHasStatus({
        isConnected: true,
        isActive: false,
        clipboardMessage: null,
        timer: createTimer(Date.now() - 5000),
      }),
    ).toBe(true)
  })

  test('returns false when idle, connected, and timer inactive', () => {
    expect(
      computeHasStatus({
        isConnected: true,
        isActive: false,
        clipboardMessage: null,
        timer: createTimer(null),
      }),
    ).toBe(false)
  })
})
