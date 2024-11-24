// import { env } from './env.mjs'

export const STOP_MARKER = '[' + 'END]'
export const FIND_FILES_MARKER = '[' + 'FIND_FILES_PLEASE]'
export const TOOL_RESULT_MARKER = '[' + 'TOOL_RESULT]'
export const EXISTING_CODE_MARKER = '[[**REPLACE_WITH_EXISTING_CODE**]]'

export const DEFAULT_IGNORED_FILES = [
  '.git',
  '.env',
  '*.min.*',
  'node_modules',
  'venv',
  'virtualenv',
  'env',
  '.venv',
  '.virtualenv',
  'ENV',
  '__pycache__',
  '*.egg-info/',
  '*.pyc',
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
]

export const REQUEST_CREDIT_SHOW_THRESHOLD = 50
export const MAX_DATE = new Date(86399999999999)

export type UsageLimits = 'ANON' | 'FREE' | 'PAID' | 'PRO_PLUS'
export const CREDITS_USAGE_LIMITS: Record<UsageLimits, number> =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'
    ? {
        ANON: 1_000_000,
        FREE: 2_500_000,
        PAID: 10_000_000,
        PRO_PLUS: 55_000_000,
      }
    : {
        ANON: 750,
        FREE: 1_500,
        PAID: 10_000,
        PRO_PLUS: 55_000,
      }
export const CREDITS_REFERRAL_BONUS = 500

export const claudeModels = {
  sonnet: 'claude-3-5-sonnet-20241022',
  haiku: 'claude-3-5-haiku-20241022',
} as const

export const openaiModels = {
  gpt4o: 'gpt-4o-2024-08-06',
  gpt4omini: 'gpt-4o-mini-2024-07-18',
} as const

export const models = {
  ...claudeModels,
  ...openaiModels,
}

export const TEST_USER_ID = 'test-user-id'
