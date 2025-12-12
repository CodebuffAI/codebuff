/**
 * CLI environment helper for dependency injection.
 *
 * This module provides CLI-specific env helpers that extend the base
 * process env with CLI-specific vars for terminal/IDE detection.
 */

import {
  getBaseEnv,
  createTestBaseEnv,
} from '@codebuff/common/env-process'

import type { CliEnv } from '../types/env'

/**
 * Get CLI environment values.
 * Composes from getBaseEnv() + CLI-specific vars.
 */
export const getCliEnv = (): CliEnv => ({
  ...getBaseEnv(),

  // Terminal detection
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

  // Binary build configuration
  CODEBUFF_IS_BINARY: process.env.CODEBUFF_IS_BINARY,
  CODEBUFF_CLI_VERSION: process.env.CODEBUFF_CLI_VERSION,
  CODEBUFF_CLI_TARGET: process.env.CODEBUFF_CLI_TARGET,
  CODEBUFF_RG_PATH: process.env.CODEBUFF_RG_PATH,
})

/**
 * Create a test CliEnv with optional overrides.
 * Composes from createTestBaseEnv() for DRY.
 */
export const createTestCliEnv = (
  overrides: Partial<CliEnv> = {},
): CliEnv => ({
  ...createTestBaseEnv(),

  // CLI-specific defaults
  KITTY_WINDOW_ID: undefined,
  SIXEL_SUPPORT: undefined,
  ZED_NODE_ENV: undefined,
  VSCODE_THEME_KIND: undefined,
  VSCODE_COLOR_THEME_KIND: undefined,
  VSCODE_GIT_IPC_HANDLE: undefined,
  VSCODE_PID: undefined,
  VSCODE_CWD: undefined,
  VSCODE_NLS_CONFIG: undefined,
  CURSOR_PORT: undefined,
  CURSOR: undefined,
  JETBRAINS_REMOTE_RUN: undefined,
  IDEA_INITIAL_DIRECTORY: undefined,
  IDE_CONFIG_DIR: undefined,
  JB_IDE_CONFIG_DIR: undefined,
  VISUAL: undefined,
  EDITOR: undefined,
  CODEBUFF_CLI_EDITOR: undefined,
  CODEBUFF_EDITOR: undefined,
  OPEN_TUI_THEME: undefined,
  OPENTUI_THEME: undefined,
  CODEBUFF_IS_BINARY: undefined,
  CODEBUFF_CLI_VERSION: undefined,
  CODEBUFF_CLI_TARGET: undefined,
  CODEBUFF_RG_PATH: undefined,
  ...overrides,
})
