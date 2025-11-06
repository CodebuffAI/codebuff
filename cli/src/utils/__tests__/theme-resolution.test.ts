import { describe, it, expect } from 'bun:test'
import {
  computePreferredThemeDetailed,
  type ThemeResolution,
} from '../../utils/theme-system'

describe('computePreferredThemeDetailed diagnostics', () => {
  it('returns source=terminal when terminal available', () => {
    const res = computePreferredThemeDetailed({
      lastTerminal: 'dark',
      ide: 'light',
      platform: 'light',
    })
    expect(res.selected).toBe('dark')
    expect(res.source).toBe('terminal')
  })

  it('returns source=ide when terminal missing', () => {
    const res = computePreferredThemeDetailed({
      lastTerminal: null,
      ide: 'light',
      platform: 'dark',
    })
    expect(res.selected).toBe('light')
    expect(res.source).toBe('ide')
  })

  it('returns source=platform when only OS available', () => {
    const res = computePreferredThemeDetailed({
      lastTerminal: null,
      ide: null,
      platform: 'dark',
    })
    expect(res.selected).toBe('dark')
    expect(res.source).toBe('platform')
  })
})
