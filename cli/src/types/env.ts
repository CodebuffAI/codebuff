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
} from '@codebirds/common/types/contracts/env'

/**
 * CLI-specific env vars for terminal/IDE detection and editor preferences.
 */
export type CliEnv = BaseEnv & {
  // Terminal detection (for tmux/screen passthrough)
  TERM?: string
  TMUX?: string
  STY?: string

  // SSH/remote session detection
  SSH_CLIENT?: string
  SSH_TTY?: string
  SSH_CONNECTION?: string
  CODESPACES?: string

  // Display server detection (Linux headless check)
  DISPLAY?: string
  WAYLAND_DISPLAY?: string

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
  CODEBIRDS_CLI_EDITOR?: string
  CODEBIRDS_EDITOR?: string

  // Theme preferences
  OPEN_TUI_THEME?: string
  OPENTUI_THEME?: string

  // Codebirds CLI-specific (set during binary build)
  CODEBIRDS_IS_BINARY?: string
  CODEBIRDS_CLI_VERSION?: string
  CODEBIRDS_CLI_TARGET?: string
  CODEBIRDS_RG_PATH?: string
  CODEBIRDS_SCROLL_MULTIPLIER?: string
  CODEBIRDS_PERF_TEST?: string
  CODEBIRDS_TRACE?: string
  // Toggle for mirroring CLI logs to the server's /api/logs sink (Axiom).
  CODEBIRDS_SHIP_LOGS?: string
  CODEBIRDS_MODE?: string
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
