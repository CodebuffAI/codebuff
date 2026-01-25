/**
 * CLI-specific environment variable types.
 *
 * Extends base types from common with CLI-specific vars for:
 * - Terminal/IDE detection
 * - Editor preferences
 * - Binary build configuration
 */

import type {
  BaseEnv,
  ClientEnv,
} from '@codebuff/common/types/contracts/env'

/**
 * CLI-specific env vars for terminal/IDE detection and editor preferences.
 */
export type CliEnv = BaseEnv & {
  // Terminal detection (for tmux/screen passthrough)
  TERM?: string
  TMUX?: string
  STY?: string

  // Terminal-specific
  KITTY_WINDOW_ID?: string
  SIXEL_SUPPORT?: string
  ZED_NODE_ENV?: string
  ZED_TERM?: string
  ZED_SHELL?: string
  COLORTERM?: string

  // VS Code family detection
  VSCODE_THEME_KIND?: string
  VSCODE_COLOR_THEME_KIND?: string
  VSCODE_GIT_IPC_HANDLE?: string
  VSCODE_PID?: string
  VSCODE_CWD?: string
  VSCODE_NLS_CONFIG?: string

  // Cursor editor detection
  CURSOR_PORT?: string
  CURSOR?: string

  // JetBrains IDE detection
  JETBRAINS_REMOTE_RUN?: string
  IDEA_INITIAL_DIRECTORY?: string
  IDE_CONFIG_DIR?: string
  JB_IDE_CONFIG_DIR?: string

  // Editor preferences
  VISUAL?: string
  EDITOR?: string
  CODEBUFF_CLI_EDITOR?: string
  CODEBUFF_EDITOR?: string

  // Theme preferences
  OPEN_TUI_THEME?: string
  OPENTUI_THEME?: string

  // Codebuff CLI-specific (set during binary build)
  CODEBUFF_IS_BINARY?: string
  CODEBUFF_CLI_VERSION?: string
  CODEBUFF_CLI_TARGET?: string
  CODEBUFF_RG_PATH?: string
  CODEBUFF_SCROLL_MULTIPLIER?: string
  CODEBUFF_PERF_TEST?: string
}

/**
 * Full CLI env deps combining client env and CLI env.
 */
export type CliEnvDeps = {
  clientEnv: ClientEnv
  env: CliEnv
}

/**
 * Function type for getting CLI env values.
 */
export type GetCliEnvFn = () => CliEnv
