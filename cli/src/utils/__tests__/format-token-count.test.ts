import { describe, expect, test } from 'bun:test'

import {
  formatContextUsage,
  formatTokenCount,
} from '../format-token-count'

describe('formatTokenCount', () => {
  test('small counts render as-is', () => {
    expect(formatTokenCount(0)).toBe('0')
    expect(formatTokenCount(982)).toBe('982')
  })

  test('thousands get a K suffix with one decimal', () => {
    expect(formatTokenCount(1000)).toBe('1K')
    expect(formatTokenCount(14_231)).toBe('14.2K')
    expect(formatTokenCount(132_500)).toBe('132.5K')
    expect(formatTokenCount(999_949)).toBe('999.9K')
  })

  test('millions get an M suffix', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M')
    expect(formatTokenCount(1_250_000)).toBe('1.3M')
  })

  test('values that round to 1000K promote to 1M', () => {
    expect(formatTokenCount(999_960)).toBe('1M')
  })

  test('garbage is rendered as zero rather than NaN', () => {
    expect(formatTokenCount(Number.NaN)).toBe('0')
    expect(formatTokenCount(-5)).toBe('0')
  })
})

describe('formatContextUsage', () => {
  test('formats tokens with a rounded window percentage', () => {
    expect(formatContextUsage(14_231, 203_300)).toBe('14.2K (7%)')
    expect(formatContextUsage(131_072, 1_048_576)).toBe('131.1K (13%)')
  })

  test('never shows 0% for a non-empty context', () => {
    expect(formatContextUsage(1200, 1_048_576)).toBe('1.2K (1%)')
  })

  test('clamps at 100% when the estimate overshoots the window', () => {
    expect(formatContextUsage(150_000, 131_072)).toBe('150K (100%)')
  })

  test('returns null when there is nothing to show', () => {
    expect(formatContextUsage(0, 131_072)).toBeNull()
    expect(formatContextUsage(Number.NaN, 131_072)).toBeNull()
  })

  test('omits the percentage when the window is unknown', () => {
    expect(formatContextUsage(14_231, 0)).toBe('14.2K')
  })
})
