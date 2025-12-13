import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  getProcessEnv,
  processEnv,
  createTestProcessEnv,
} from '../env-process'

describe('env-process', () => {
  describe('getProcessEnv', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      // Restore original env
      Object.keys(process.env).forEach((key) => {
        if (!(key in originalEnv)) {
          delete process.env[key]
        }
      })
      Object.assign(process.env, originalEnv)
    })

    test('returns current process.env values for SHELL', () => {
      process.env.SHELL = '/bin/zsh'
      const env = getProcessEnv()
      expect(env.SHELL).toBe('/bin/zsh')
    })

    test('returns current process.env values for HOME', () => {
      process.env.HOME = '/Users/testuser'
      const env = getProcessEnv()
      expect(env.HOME).toBe('/Users/testuser')
    })

    test('returns current process.env values for TERM', () => {
      process.env.TERM = 'xterm-256color'
      const env = getProcessEnv()
      expect(env.TERM).toBe('xterm-256color')
    })

    test('returns current process.env values for TERM_PROGRAM', () => {
      process.env.TERM_PROGRAM = 'iTerm.app'
      const env = getProcessEnv()
      expect(env.TERM_PROGRAM).toBe('iTerm.app')
    })

    test('returns current process.env values for NODE_ENV', () => {
      process.env.NODE_ENV = 'development'
      const env = getProcessEnv()
      expect(env.NODE_ENV).toBe('development')
    })

    test('returns undefined for unset env vars', () => {
      delete process.env.KITTY_WINDOW_ID
      const env = getProcessEnv()
      expect(env.KITTY_WINDOW_ID).toBeUndefined()
    })

    test('returns current process.env values for CODEBUFF_IS_BINARY', () => {
      process.env.CODEBUFF_IS_BINARY = 'true'
      const env = getProcessEnv()
      expect(env.CODEBUFF_IS_BINARY).toBe('true')
    })

    test('returns a snapshot that does not change when process.env changes', () => {
      process.env.SHELL = '/bin/bash'
      const env = getProcessEnv()
      process.env.SHELL = '/bin/zsh'
      // The snapshot should still have the old value
      expect(env.SHELL).toBe('/bin/bash')
    })
  })

  describe('processEnv', () => {
    test('is a ProcessEnv object', () => {
      expect(processEnv).toBeDefined()
      expect(typeof processEnv).toBe('object')
    })

    test('contains expected keys', () => {
      expect('SHELL' in processEnv).toBe(true)
      expect('HOME' in processEnv).toBe(true)
      expect('TERM' in processEnv).toBe(true)
      expect('NODE_ENV' in processEnv).toBe(true)
      expect('PATH' in processEnv).toBe(true)
    })
  })

  describe('createTestProcessEnv', () => {
    test('returns a ProcessEnv with default test values', () => {
      const env = createTestProcessEnv()
      expect(env.HOME).toBe('/home/test')
      expect(env.NODE_ENV).toBe('test')
      expect(env.TERM).toBe('xterm-256color')
      expect(env.PATH).toBe('/usr/bin')
    })

    test('returns undefined for most vars by default', () => {
      const env = createTestProcessEnv()
      expect(env.SHELL).toBeUndefined()
      expect(env.COMSPEC).toBeUndefined()
      expect(env.TERM_PROGRAM).toBeUndefined()
      expect(env.KITTY_WINDOW_ID).toBeUndefined()
      expect(env.CODEBUFF_IS_BINARY).toBeUndefined()
    })

    test('allows overriding specific values', () => {
      const env = createTestProcessEnv({
        SHELL: '/bin/fish',
        TERM_PROGRAM: 'vscode',
      })
      expect(env.SHELL).toBe('/bin/fish')
      expect(env.TERM_PROGRAM).toBe('vscode')
      // Other values should still have defaults
      expect(env.HOME).toBe('/home/test')
      expect(env.NODE_ENV).toBe('test')
    })

    test('allows overriding default values', () => {
      const env = createTestProcessEnv({
        HOME: '/custom/home',
        NODE_ENV: 'production',
      })
      expect(env.HOME).toBe('/custom/home')
      expect(env.NODE_ENV).toBe('production')
    })

    test('allows setting CODEBUFF_IS_BINARY for binary mode tests', () => {
      const env = createTestProcessEnv({
        CODEBUFF_IS_BINARY: 'true',
        CODEBUFF_CLI_VERSION: '1.0.0',
      })
      expect(env.CODEBUFF_IS_BINARY).toBe('true')
      expect(env.CODEBUFF_CLI_VERSION).toBe('1.0.0')
    })

    test('allows setting terminal-specific vars', () => {
      const env = createTestProcessEnv({
        TERM_PROGRAM: 'iTerm.app',
        KITTY_WINDOW_ID: '12345',
        SIXEL_SUPPORT: 'true',
      })
      expect(env.TERM_PROGRAM).toBe('iTerm.app')
      expect(env.KITTY_WINDOW_ID).toBe('12345')
      expect(env.SIXEL_SUPPORT).toBe('true')
    })
  })
})
