// import { env } from './env.mjs'

export const STOP_MARKER = '[' + 'END]'
export const FIND_FILES_MARKER = '[' + 'FIND_FILES_PLEASE]'
export const TOOL_RESULT_MARKER = '[' + 'TOOL_RESULT]'

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
  'who',
  'write',
  'yes',
  'help',
  'find',
  'kill',
  'add',
  'hey',
  'diff',
]

export const MAX_DATE = new Date(86399999999999)

export type UsageLimits = 'ANON' | 'FREE' | 'PAID'
export const CREDITS_USAGE_LIMITS: Record<UsageLimits, number> =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'local'
    ? {
        ANON: 1_000_000,
        FREE: 2_500_000,
        PAID: 50_000_000,
      }
    : {
        ANON: 1_000,
        FREE: 2_500,
        PAID: 50_000,
      }
export const CREDITS_REFERRAL_BONUS = 500

export const claudeModels = {
  sonnet: 'claude-3-5-sonnet-20240620',
  haiku: 'claude-3-haiku-20240307',
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
