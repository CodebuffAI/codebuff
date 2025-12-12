import { describe, test, expect, afterEach } from 'bun:test'

import { getCliEnv, createTestCliEnv } from '../../utils/env'

describe('cli/utils/env', () => {
  describe('getCliEnv', () => {
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

    test('returns current process.env values for base vars', () => {
      process.env.SHELL = '/bin/zsh'
      process.env.HOME = '/Users/testuser'
      const env = getCliEnv()
      expect(env.SHELL).toBe('/bin/zsh')
      expect(env.HOME).toBe('/Users/testuser')
    })

    test('returns current process.env values for terminal detection vars', () => {
      process.env.TERM_PROGRAM = 'iTerm.app'
      process.env.KITTY_WINDOW_ID = '12345'
      const env = getCliEnv()
      expect(env.TERM_PROGRAM).toBe('iTerm.app')
      expect(env.KITTY_WINDOW_ID).toBe('12345')
    })

    test('returns current process.env values for VS Code detection', () => {
      process.env.VSCODE_PID = '1234'
      process.env.VSCODE_THEME_KIND = 'dark'
      const env = getCliEnv()
      expect(env.VSCODE_PID).toBe('1234')
      expect(env.VSCODE_THEME_KIND).toBe('dark')
    })

    test('returns current process.env values for Cursor detection', () => {
      process.env.CURSOR_PORT = '5678'
      process.env.CURSOR = 'true'
      const env = getCliEnv()
      expect(env.CURSOR_PORT).toBe('5678')
      expect(env.CURSOR).toBe('true')
    })

    test('returns current process.env values for JetBrains detection', () => {
      process.env.TERMINAL_EMULATOR = 'JetBrains-JediTerm'
      process.env.IDE_CONFIG_DIR = '/path/to/idea'
      const env = getCliEnv()
      expect(env.TERMINAL_EMULATOR).toBe('JetBrains-JediTerm')
      expect(env.IDE_CONFIG_DIR).toBe('/path/to/idea')
    })

    test('returns current process.env values for editor preferences', () => {
      process.env.EDITOR = 'vim'
      process.env.CODEBUFF_CLI_EDITOR = 'code'
      const env = getCliEnv()
      expect(env.EDITOR).toBe('vim')
      expect(env.CODEBUFF_CLI_EDITOR).toBe('code')
    })

    test('returns current process.env values for theme preferences', () => {
      process.env.OPEN_TUI_THEME = 'dark'
      const env = getCliEnv()
      expect(env.OPEN_TUI_THEME).toBe('dark')
    })

    test('returns current process.env values for binary build config', () => {
      process.env.CODEBUFF_IS_BINARY = 'true'
      process.env.CODEBUFF_CLI_VERSION = '1.0.0'
      const env = getCliEnv()
      expect(env.CODEBUFF_IS_BINARY).toBe('true')
      expect(env.CODEBUFF_CLI_VERSION).toBe('1.0.0')
    })

    test('returns undefined for unset env vars', () => {
      delete process.env.KITTY_WINDOW_ID
      delete process.env.VSCODE_PID
      const env = getCliEnv()
      expect(env.KITTY_WINDOW_ID).toBeUndefined()
      expect(env.VSCODE_PID).toBeUndefined()
    })

    test('returns a snapshot that does not change when process.env changes', () => {
      process.env.TERM_PROGRAM = 'iTerm.app'
      const env = getCliEnv()
      process.env.TERM_PROGRAM = 'vscode'
      expect(env.TERM_PROGRAM).toBe('iTerm.app')
    })
  })

  describe('createTestCliEnv', () => {
    test('returns a CliEnv with default test values', () => {
      const env = createTestCliEnv()
      expect(env.HOME).toBe('/home/test')
      expect(env.NODE_ENV).toBe('test')
      expect(env.TERM).toBe('xterm-256color')
      expect(env.PATH).toBe('/usr/bin')
    })

    test('returns undefined for CLI-specific vars by default', () => {
      const env = createTestCliEnv()
      expect(env.KITTY_WINDOW_ID).toBeUndefined()
      expect(env.VSCODE_PID).toBeUndefined()
      expect(env.CURSOR_PORT).toBeUndefined()
      expect(env.IDE_CONFIG_DIR).toBeUndefined()
      expect(env.CODEBUFF_IS_BINARY).toBeUndefined()
    })

    test('allows overriding terminal detection vars', () => {
      const env = createTestCliEnv({
        TERM_PROGRAM: 'iTerm.app',
        KITTY_WINDOW_ID: '12345',
        SIXEL_SUPPORT: 'true',
      })
      expect(env.TERM_PROGRAM).toBe('iTerm.app')
      expect(env.KITTY_WINDOW_ID).toBe('12345')
      expect(env.SIXEL_SUPPORT).toBe('true')
    })

    test('allows overriding VS Code detection vars', () => {
      const env = createTestCliEnv({
        VSCODE_PID: '1234',
        VSCODE_THEME_KIND: 'dark',
        VSCODE_GIT_IPC_HANDLE: '/tmp/vscode-git',
      })
      expect(env.VSCODE_PID).toBe('1234')
      expect(env.VSCODE_THEME_KIND).toBe('dark')
      expect(env.VSCODE_GIT_IPC_HANDLE).toBe('/tmp/vscode-git')
    })

    test('allows overriding editor preferences', () => {
      const env = createTestCliEnv({
        EDITOR: 'vim',
        VISUAL: 'code',
        CODEBUFF_CLI_EDITOR: 'cursor',
      })
      expect(env.EDITOR).toBe('vim')
      expect(env.VISUAL).toBe('code')
      expect(env.CODEBUFF_CLI_EDITOR).toBe('cursor')
    })

    test('allows overriding binary build config', () => {
      const env = createTestCliEnv({
        CODEBUFF_IS_BINARY: 'true',
        CODEBUFF_CLI_VERSION: '2.0.0',
        CODEBUFF_CLI_TARGET: 'darwin-arm64',
      })
      expect(env.CODEBUFF_IS_BINARY).toBe('true')
      expect(env.CODEBUFF_CLI_VERSION).toBe('2.0.0')
      expect(env.CODEBUFF_CLI_TARGET).toBe('darwin-arm64')
    })

    test('allows overriding default values', () => {
      const env = createTestCliEnv({
        HOME: '/custom/home',
        NODE_ENV: 'production',
      })
      expect(env.HOME).toBe('/custom/home')
      expect(env.NODE_ENV).toBe('production')
    })
  })
})
