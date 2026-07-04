import { createTestBaseEnv } from '@codebirds/common/testing-env-process'

import type { CliEnv } from '../types/env'

/**
 * Test-only CLI env builder.
 */
export const createTestCliEnv = (overrides: Partial<CliEnv> = {}): CliEnv => ({
  ...createTestBaseEnv(),

  // CLI-specific defaults
  SSH_CLIENT: undefined,
  SSH_TTY: undefined,
  SSH_CONNECTION: undefined,
  KITTY_WINDOW_ID: undefined,
  SIXEL_SUPPORT: undefined,
  ZED_NODE_ENV: undefined,
  ZED_TERM: undefined,
  ZED_SHELL: undefined,
  COLORTERM: undefined,
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
  CODEBIRDS_CLI_EDITOR: undefined,
  CODEBIRDS_EDITOR: undefined,
  OPEN_TUI_THEME: undefined,
  OPENTUI_THEME: undefined,
  CODEBIRDS_IS_BINARY: undefined,
  CODEBIRDS_CLI_VERSION: undefined,
  CODEBIRDS_CLI_TARGET: undefined,
  CODEBIRDS_RG_PATH: undefined,
  CODEBIRDS_SCROLL_MULTIPLIER: undefined,
  CODEBIRDS_MODE: undefined,
  ...overrides,
})
