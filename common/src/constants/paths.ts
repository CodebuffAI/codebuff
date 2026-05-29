export const STOP_MARKER = '[' + 'END]'
export const FIND_FILES_MARKER = '[' + 'FIND_FILES_PLEASE]'

// Directory where agent template override files are stored
export const AGENT_TEMPLATES_DIR = '.agents/'
export const AGENT_DEFINITION_FILE = 'agent-definition.d.ts'

export const API_KEY_ENV_VAR = 'CODEBUFF_API_KEY'

export const INVALID_AUTH_TOKEN_MESSAGE =
  'Invalid auth token. You may have been logged out from the web portal. Please log in again.'

export const DEFAULT_IGNORED_PATHS = [
  '.git',
  '.env',
  '.env.*',
  '*.min.*',
  'node_modules',
  'venv',
  'virtualenv',
  '.venv',
  '.virtualenv',
  '__pycache__',
  '*.egg-info/',
  '*.pyc',
  '.DS_Store',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.next',
  'package-lock.json',
  'bun.lockb',
]

// Special message content tags indicating specific server states
export const ASKED_CONFIG = 'asked_config'
export const SHOULD_ASK_CONFIG = 'should_ask_config'
export const ONE_TIME_TAGS = [] as const
export const ONE_TIME_LABELS = [
  ...ONE_TIME_TAGS,
  ASKED_CONFIG,
  SHOULD_ASK_CONFIG,
] as const

export const FILE_READ_STATUS = {
  DOES_NOT_EXIST: '[FILE_DOES_NOT_EXIST]',
  IGNORED: '[BLOCKED]',
  TEMPLATE: '[TEMPLATE]',
  OUTSIDE_PROJECT: '[FILE_OUTSIDE_PROJECT]',
  TOO_LARGE: '[FILE_TOO_LARGE]',
  ERROR: '[FILE_READ_ERROR]',
} as const

export const HIDDEN_FILE_READ_STATUS = [
  FILE_READ_STATUS.DOES_NOT_EXIST,
  FILE_READ_STATUS.IGNORED,
  FILE_READ_STATUS.OUTSIDE_PROJECT,
  FILE_READ_STATUS.TOO_LARGE,
  FILE_READ_STATUS.ERROR,
]

export function toOptionalFile(file: string | null) {
  if (file === null) return null
  return HIDDEN_FILE_READ_STATUS.some((status) => file.startsWith(status))
    ? null
    : file
}

export const TEST_USER_ID = 'test-user-id'
