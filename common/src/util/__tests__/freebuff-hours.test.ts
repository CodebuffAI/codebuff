import { describe, expect, test } from 'bun:test'

import {
  FREEBUCKS_PER_HOUR,
  formatHours,
  formatHoursShort,
  formatHoursWithUnit,
  freebucksToHours,
  freebuffModelMultiplierLabel,
  freebuffMultiplierText,
} from '../freebuff-hours'

describe('hours', () => {
  test('one hour is 5 Freebucks', () => {
    expect(FREEBUCKS_PER_HOUR).toBe(5)
    expect(freebucksToHours(250)).toBe(50)
    expect(freebucksToHours(37)).toBe(7.4)
  })

  test.each([
    [0, '0'],
    [5, '1'],
    [250, '50'],
    [37, '7.4'],
    // Rounded down: never more than the balance buys.
    [39, '7.8'],
    [4, '0.8'],
    [-10, '0'],
    [6_500, '1,300'],
  ])('%p Freebucks reads as %p', (freebucks, text) => {
    expect(formatHours(freebucks)).toBe(text)
  })

  test('units', () => {
    expect(formatHoursWithUnit(5)).toBe('1 hour')
    expect(formatHoursWithUnit(250)).toBe('50 hours')
    expect(formatHoursShort(5)).toBe('1 hr')
    expect(formatHoursShort(50)).toBe('10 hrs')
  })

  test.each([
    [10, '2x'],
    [15, '3x'],
    [20, '4x'],
    [25, '5x'],
    [250, '50x'],
    [2, '0.4x'],
    // No label: free (Unlimited), 1x (MiMo Slow), unpriced.
    [0, null],
    [5, null],
    [undefined, null],
    [null, null],
    [Number.NaN, null],
  ])('a %p Freebuck row is labelled %p', (price, label) => {
    expect(freebuffModelMultiplierLabel(price)).toBe(label)
  })

  test('multiplier text never leaves a hole in a sentence', () => {
    expect(freebuffMultiplierText(15)).toBe('3x')
    expect(freebuffMultiplierText(5)).toBe('1x')
    expect(freebuffMultiplierText(0)).toBe('free')
  })
})
