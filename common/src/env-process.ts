/**
 * Process environment helper for dependency injection.
 *
 * This module provides a typed interface to process.env values that aren't
 * part of our validated schemas (ClientEnv/ServerEnv). These are runtime
 * environment variables like SHELL, HOME, TERM, etc.
 *
 * Usage:
 * - Import `getBaseProcessEnv` for base OS-level vars only
 * - Import `getProcessEnv` for the full ProcessEnv (base + extensions)
 * - In tests, use `createTestBaseProcessEnv` or `createTestProcessEnv`
 */

import type { BaseEnv, ProcessEnv } from './types/contracts/env'

/**
 * Get base environment values (OS-level vars only).
 * This is the foundation that package-specific helpers should spread into.
 */
export const getBaseEnv = (): BaseEnv => ({
  SHELL: process.env.SHELL,
  COMSPEC: process.env.COMSPEC,
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  APPDATA: process.env.APPDATA,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  TERM: process.env.TERM,
  TERM_PROGRAM: process.env.TERM_PROGRAM,
  TERM_BACKGROUND: process.env.TERM_BACKGROUND,
  TERMINAL_EMULATOR: process.env.TERMINAL_EMULATOR,
  COLORFGBG: process.env.COLORFGBG,
  NODE_ENV: process.env.NODE_ENV,
  NODE_PATH: process.env.NODE_PATH,
  PATH: process.env.PATH,
})

/**
 * Create test defaults for BaseEnv.
 * Package-specific test helpers should spread this.
 */
export const createTestBaseEnv = (
  overrides: Partial<BaseEnv> = {},
): BaseEnv => ({
  SHELL: undefined,
  COMSPEC: undefined,
  HOME: '/home/test',
  USERPROFILE: undefined,
  APPDATA: undefined,
  XDG_CONFIG_HOME: undefined,
  TERM: 'xterm-256color',
  TERM_PROGRAM: undefined,
  TERM_BACKGROUND: undefined,
  TERMINAL_EMULATOR: undefined,
  COLORFGBG: undefined,
  NODE_ENV: 'test',
  NODE_PATH: undefined,
  PATH: '/usr/bin',
  ...overrides,
})

/**
 * Get full process environment values (base + all extensions).
 * Returns a snapshot of the current process.env values for the ProcessEnv type.
 */
export const getProcessEnv = (): ProcessEnv => ({
  ...getBaseEnv(),

  // Terminal-specific
  KITTY_WINDOW_ID: process.env.KITTY_WINDOW_ID,
  SIXEL_SUPPORT: process.env.SIXEL_SUPPORT,
  ZED_NODE_ENV: process.env.ZED_NODE_ENV,

  // VS Code family detection
  VSCODE_THEME_KIND: process.env.VSCODE_THEME_KIND,
  VSCODE_COLOR_THEME_KIND: process.env.VSCODE_COLOR_THEME_KIND,
  VSCODE_GIT_IPC_HANDLE: process.env.VSCODE_GIT_IPC_HANDLE,
  VSCODE_PID: process.env.VSCODE_PID,
  VSCODE_CWD: process.env.VSCODE_CWD,
  VSCODE_NLS_CONFIG: process.env.VSCODE_NLS_CONFIG,

  // Cursor editor detection
  CURSOR_PORT: process.env.CURSOR_PORT,
  CURSOR: process.env.CURSOR,

  // JetBrains IDE detection
  JETBRAINS_REMOTE_RUN: process.env.JETBRAINS_REMOTE_RUN,
  IDEA_INITIAL_DIRECTORY: process.env.IDEA_INITIAL_DIRECTORY,
  IDE_CONFIG_DIR: process.env.IDE_CONFIG_DIR,
  JB_IDE_CONFIG_DIR: process.env.JB_IDE_CONFIG_DIR,

  // Editor preferences
  VISUAL: process.env.VISUAL,
  EDITOR: process.env.EDITOR,
  CODEBUFF_CLI_EDITOR: process.env.CODEBUFF_CLI_EDITOR,
  CODEBUFF_EDITOR: process.env.CODEBUFF_EDITOR,

  // Theme preferences
  OPEN_TUI_THEME: process.env.OPEN_TUI_THEME,
  OPENTUI_THEME: process.env.OPENTUI_THEME,

  // Codebuff CLI-specific
  CODEBUFF_IS_BINARY: process.env.CODEBUFF_IS_BINARY,
  CODEBUFF_CLI_VERSION: process.env.CODEBUFF_CLI_VERSION,
  CODEBUFF_CLI_TARGET: process.env.CODEBUFF_CLI_TARGET,
  CODEBUFF_RG_PATH: process.env.CODEBUFF_RG_PATH,
  CODEBUFF_WASM_DIR: process.env.CODEBUFF_WASM_DIR,

  // Build/CI flags
  VERBOSE: process.env.VERBOSE,
  OVERRIDE_TARGET: process.env.OVERRIDE_TARGET,
  OVERRIDE_PLATFORM: process.env.OVERRIDE_PLATFORM,
  OVERRIDE_ARCH: process.env.OVERRIDE_ARCH,
})

/**
 * Default process env instance.
 * Use this for production code, inject mocks in tests.
 */
export const processEnv: ProcessEnv = getProcessEnv()

/**
 * Create a test ProcessEnv with optional overrides.
 * Composes from createTestBaseProcessEnv for DRY.
 */
export const createTestProcessEnv = (
  overrides: Partial<ProcessEnv> = {},
): ProcessEnv => ({
  ...createTestBaseEnv(),

  // Terminal-specific
  KITTY_WINDOW_ID: undefined,
  SIXEL_SUPPORT: undefined,
  ZED_NODE_ENV: undefined,

  // VS Code family detection
  VSCODE_THEME_KIND: undefined,
  VSCODE_COLOR_THEME_KIND: undefined,
  VSCODE_GIT_IPC_HANDLE: undefined,
  VSCODE_PID: undefined,
  VSCODE_CWD: undefined,
  VSCODE_NLS_CONFIG: undefined,

  // Cursor editor detection
  CURSOR_PORT: undefined,
  CURSOR: undefined,

  // JetBrains IDE detection
  JETBRAINS_REMOTE_RUN: undefined,
  IDEA_INITIAL_DIRECTORY: undefined,
  IDE_CONFIG_DIR: undefined,
  JB_IDE_CONFIG_DIR: undefined,

  // Editor preferences
  VISUAL: undefined,
  EDITOR: undefined,
  CODEBUFF_CLI_EDITOR: undefined,
  CODEBUFF_EDITOR: undefined,

  // Theme preferences
  OPEN_TUI_THEME: undefined,
  OPENTUI_THEME: undefined,

  // Codebuff CLI-specific
  CODEBUFF_IS_BINARY: undefined,
  CODEBUFF_CLI_VERSION: undefined,
  CODEBUFF_CLI_TARGET: undefined,
  CODEBUFF_RG_PATH: undefined,
  CODEBUFF_WASM_DIR: undefined,

  // Build/CI flags
  VERBOSE: undefined,
  OVERRIDE_TARGET: undefined,
  OVERRIDE_PLATFORM: undefined,
  OVERRIDE_ARCH: undefined,
  ...overrides,
})
