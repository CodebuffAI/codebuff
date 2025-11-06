// IDE / Editor detection constants shared across utils

export const VS_CODE_FAMILY_ENV_KEYS = [
  'VSCODE_PID',
  'VSCODE_CWD',
  'VSCODE_IPC_HOOK_CLI',
  'VSCODE_LOG_NATIVE',
  'VSCODE_NLS_CONFIG',
  'CURSOR_SESSION_ID',
  'CURSOR',
] as const

export const VS_CODE_PRODUCT_DIRS = [
  'Code',
  'Code - Insiders',
  'Code - OSS',
  'VSCodium',
  'VSCodium - Insiders',
  'Cursor',
] as const

export const JETBRAINS_ENV_KEYS = [
  'JB_PRODUCT_CODE',
  'JB_SYSTEM_PATH',
  'JB_INSTALLATION_HOME',
  'IDEA_INITIAL_DIRECTORY',
  'IDE_CONFIG_DIR',
  'JB_IDE_CONFIG_DIR',
] as const

