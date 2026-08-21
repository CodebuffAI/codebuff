import { describe, expect, test } from 'bun:test'

import {
  DEEPSEEK_EXPENSIVE_WINDOW_UTC,
  deepSeekExpensiveWindowEndsAt,
  deepseekPricingWindow,
  isDeepSeekExpensiveWindow,
} from '../constants/freebuff-peak-hours'

/** A UTC instant on the given hour, on an ordinary day. */
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 20, hour, minute))

describe('the peak windows', () => {
  test.each([
    [0, 'off-peak'],
    [1, 'peak'],
    [3, 'peak'],
    [4, 'off-peak'],
    [5, 'off-peak'], // the gap BETWEEN the two windows — what a single range
    [6, 'peak'], //     check silently gets wrong
    [9, 'peak'],
    [10, 'off-peak'],
    [23, 'off-peak'],
  ])('%i:00 UTC is %s', (hour, window) => {
    expect(deepseekPricingWindow(at(hour as number))).toBe(window as any)
  })

  test('treats boundaries as half-open, so the closing hour is already off-peak', () => {
    expect(deepseekPricingWindow(at(3, 59))).toBe('peak')
    expect(deepseekPricingWindow(at(4, 0))).toBe('off-peak')
    expect(deepseekPricingWindow(at(9, 59))).toBe('peak')
    expect(deepseekPricingWindow(at(10, 0))).toBe('off-peak')
  })
})

describe('the expensive window', () => {
  // The one thing still keyed to the clock: V4 Pro pauses inside it. A user's
  // spend ceiling is deliberately NOT — it is the same figure at every hour.
  test('runs an hour ahead of the first peak through the last one’s close', () => {
    expect(DEEPSEEK_EXPENSIVE_WINDOW_UTC).toEqual([0, 10])
  })

  test.each([
    [0, true], // the lead hour: sessions admitted here still run into peak
    [2, true],
    [5, true], // swallows the off-peak gap rather than reopening for two hours
    [9, true],
    [10, false],
    [23, false],
  ])('%i:00 UTC expensive=%p', (hour, expensive) => {
    expect(isDeepSeekExpensiveWindow(at(hour as number))).toBe(
      expensive as boolean,
    )
  })

  test('reports the close, and leaves instants outside it alone', () => {
    expect(deepSeekExpensiveWindowEndsAt(at(2)).toISOString()).toBe(
      at(10).toISOString(),
    )
    expect(deepSeekExpensiveWindowEndsAt(at(14)).toISOString()).toBe(
      at(14).toISOString(),
    )
  })
})
