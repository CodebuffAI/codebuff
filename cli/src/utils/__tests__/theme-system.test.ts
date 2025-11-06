import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  computePreferredTheme,
  type ThemeName,
  isZedTerminal,
} from '../../utils/theme-system'

const originalEnv = { ...process.env }

describe('computePreferredTheme ordering', () => {
  it('prefers terminal over IDE and platform', () => {
    const out = computePreferredTheme({
      lastTerminal: 'dark',
      ide: 'light',
      platform: 'light',
    })
    expect(out).toBe('dark')
  })

  it('uses IDE when terminal is unavailable', () => {
    const out = computePreferredTheme({
      lastTerminal: null,
      ide: 'light',
      platform: 'dark',
    })
    expect(out).toBe('light')
  })

  it('falls back to platform when both are unavailable', () => {
    const out = computePreferredTheme({
      lastTerminal: null,
      ide: null,
      platform: 'dark',
    })
    expect(out).toBe('dark')
  })
})

describe('isZedTerminal', () => {
  beforeEach(() => {
    delete process.env.ZED_TERM
    delete process.env.ZED_TERMINAL
    delete process.env.ZED_SESSION
    delete process.env.TERM_PROGRAM
  })
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('detects via ZED_TERM env', () => {
    process.env.ZED_TERM = '1'
    expect(isZedTerminal()).toBe(true)
  })

  it('falls back to TERM_PROGRAM includes zed', () => {
    process.env.TERM_PROGRAM = 'zed'
    expect(isZedTerminal()).toBe(true)
  })

  it('returns false when no indicators are present', () => {
    expect(isZedTerminal()).toBe(false)
  })
})
