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

export const OVERAGE_RATE_PRO = 0.99
export const OVERAGE_RATE_MOAR_PRO = 0.9
export const CREDITS_REFERRAL_BONUS = 500

// Helper to convert from UsageLimits to display names
export const getPlanDisplayName = (limit: UsageLimits): string => {
  return PLAN_CONFIGS[limit].displayName
}

// Helper to convert from display name to UsageLimits
export const getUsageLimitFromPlanName = (planName: string): UsageLimits => {
  const entry = Object.entries(PLAN_CONFIGS).find(
    ([_, config]) => config.planName === planName
  )
  if (!entry) {
    throw new Error(`Invalid plan name: ${planName}`)
  }
  return entry[0] as UsageLimits
}

export type PlanConfig = {
  limit: number
  planName: UsageLimits
  displayName: string
  monthlyPrice: number | null // null for custom pricing (e.g. Team plan)
  overageRate: number | null // null if no overage allowed
}

export enum UsageLimits {
  ANON = 'ANON',
  FREE = 'FREE',
  PRO = 'PRO',
  MOAR_PRO = 'MOAR_PRO',
}

// Define base configs with production values
export const PLAN_CONFIGS: Record<UsageLimits, PlanConfig> = {
  ANON: {
    limit: 500,
    planName: UsageLimits.ANON,
    displayName: 'Anonymous',
    monthlyPrice: 0,
    overageRate: null,
  },
  FREE: {
    limit: 1_000,
    planName: UsageLimits.FREE,
    displayName: 'Free',
    monthlyPrice: 0,
    overageRate: null,
  },
  PRO: {
    limit: 5_000,
    planName: UsageLimits.PRO,
    displayName: 'Pro',
    monthlyPrice: 49,
    overageRate: OVERAGE_RATE_PRO,
  },
  MOAR_PRO: {
    limit: 27_500,
    planName: UsageLimits.MOAR_PRO,
    displayName: 'Moar Pro',
    monthlyPrice: 249,
    overageRate: OVERAGE_RATE_MOAR_PRO,
  },
}

// Multiply limits by 1000 in local environment
if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'local') {
  Object.values(PLAN_CONFIGS).forEach((config) => {
    config.limit *= 1000
  })
}

// Helper to get credits limit from a plan config
export const CREDITS_USAGE_LIMITS: Record<UsageLimits, number> =
  Object.fromEntries(
    Object.entries(PLAN_CONFIGS).map(([key, config]) => [key, config.limit])
  ) as Record<UsageLimits, number>

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

export const TEST_USER_ID = 'test-user-id'
