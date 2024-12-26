// import { env } from './env.mjs'

export const STOP_MARKER = '[' + 'END]'
export const FIND_FILES_MARKER = '[' + 'FIND_FILES_PLEASE]'
export const TOOL_RESULT_MARKER = '[' + 'TOOL_RESULT]'
export const EXISTING_CODE_MARKER = '[[**REPLACE_WITH_EXISTING_CODE**]]'

export const DEFAULT_IGNORED_FILES = [
  '.git',
  '.env',
  '.env.*',
  'env',
  'ENV',
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
]

export const SKIPPED_TERMINAL_COMMANDS = [
  'continue',
  'date',
  'head',
  'history',
  'if',
  'jobs',
  'less',
  'man',
  'more',
  'nice',
  'read',
  'set',
  'sort',
  'split',
  'tail',
  'test',
  'time',
  'top',
  'touch',
  'type',
  'unset',
  'what',
  'which',
  'where',
  'who',
  'write',
  'yes',
  'help',
  'find',
  'add',
  'hey',
  'diff',
  'make',
  'please',
  'apply',
  'look',
  'do',
  'break',
  'install',
]

export const REQUEST_CREDIT_SHOW_THRESHOLD = 1
export const MAX_DATE = new Date(86399999999999)

export type UsageLimits = 'ANON' | 'FREE' | 'PAID' | 'PRO_PLUS'
export const CREDITS_USAGE_LIMITS: Record<UsageLimits, number> =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'
    ? {
        ANON: 1_000_000,
        FREE: 2_500_000,
        PAID: 5_000_000,
        PRO_PLUS: 27_500_000,
      }
    : {
        ANON: 500,
        FREE: 1_000,
        PAID: 5_000,
        PRO_PLUS: 27_500,
      }
export const CREDITS_REFERRAL_BONUS = 500

export const costModes = ['lite', 'normal', 'pro'] as const
export type CostMode = (typeof costModes)[number]

export const getModelForMode = (
  costMode: CostMode,
  operation: 'agent' | 'file-requests' | 'check-new-files'
) => {
  if (operation === 'agent') {
    return costMode === 'lite' ? claudeModels.haiku : claudeModels.sonnet
  }
  if (operation === 'file-requests') {
    return costMode === 'pro' ? claudeModels.sonnet : claudeModels.haiku
  }
  if (operation === 'check-new-files') {
    return costMode === 'pro' ? models.gpt4o : models.gpt4omini
  }
  throw new Error(`Unknown operation: ${operation}`)
}

export const claudeModels = {
  sonnet: 'claude-3-5-sonnet-20241022',
  haiku: 'claude-3-5-haiku-20241022',
} as const

export const openaiModels = {
  gpt4o: 'gpt-4o-2024-08-06',
  gpt4omini: 'gpt-4o-mini-2024-07-18',
  o1: 'o1-preview',
  // o1: 'o1-2024-12-17',
} as const

export const geminiModels = {
  gemini2flash: 'gemini-2.0-flash-exp',
} as const

export const deepseekModels = {
  deepseekChat: 'deepseek-chat',
} as const

export const models = {
  ...claudeModels,
  ...openaiModels,
  ...geminiModels,
  ...deepseekModels,
} as const

export const OVERAGE_RATE_PRO = 0.99
export const OVERAGE_RATE_PRO_PLUS = 0.9

export const TEST_USER_ID = 'test-user-id'
