export const STOP_MARKER = '[' + 'END]'
export const FIND_FILES_MARKER = '[' + 'FIND_FILES_PLEASE]'
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
  'package-lock.json',
  'bun.lockb',
]

// Special message content tags indicating specific server states
export const CODEBUFF_RATE_LIMIT_INFO = 'codebuff_rate_limit_info'
export const CODEBUFF_CLAUDE_FALLBACK_INFO = 'codebuff_claude_fallback_info'
export const CODEBUFF_INVALID_KEY_INFO = 'codebuff_invalid_gemini_key_info'
export const ONE_TIME_TAGS = [
  CODEBUFF_RATE_LIMIT_INFO,
  CODEBUFF_CLAUDE_FALLBACK_INFO,
  CODEBUFF_INVALID_KEY_INFO,
] as const

export const FILE_READ_STATUS = {
  DOES_NOT_EXIST: '[FILE_DOES_NOT_EXIST]',
  IGNORED: '[FILE_IGNORED_BY_GITIGNORE_OR_CODEBUFF_IGNORE]',
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

export const REQUEST_CREDIT_SHOW_THRESHOLD = 1
export const MAX_DATE = new Date(86399999999999)
export const BILLING_PERIOD_DAYS = 30
export const OVERAGE_RATE_PRO = 0.99
export const OVERAGE_RATE_MOAR_PRO = 0.9
export const CREDITS_REFERRAL_BONUS = 250
export const AFFILIATE_USER_REFFERAL_LIMIT = 500

export const getPlanDisplayName = (limit: UsageLimits): string => {
  return PLAN_CONFIGS[limit].displayName
}

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
  monthlyPrice: number
  overageRate: number | null
}

export const UsageLimits = {
  ANON: 'ANON',
  FREE: 'FREE',
  PRO: 'PRO',
  MOAR_PRO: 'MOAR_PRO',
} as const

export type UsageLimits = (typeof UsageLimits)[keyof typeof UsageLimits]

export const PLAN_CONFIGS: Record<UsageLimits, PlanConfig> = {
  ANON: {
    limit: 250,
    planName: UsageLimits.ANON,
    displayName: 'Anonymous',
    monthlyPrice: 0,
    overageRate: null,
  },
  FREE: {
    limit: 500,
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
    displayName: 'Pro Plus',
    monthlyPrice: 249,
    overageRate: OVERAGE_RATE_MOAR_PRO,
  },
}

if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'local') {
  Object.values(PLAN_CONFIGS).forEach((config) => {
    config.limit *= 1000
  })
}

export const CREDITS_USAGE_LIMITS: Record<UsageLimits, number> =
  Object.fromEntries(
    Object.entries(PLAN_CONFIGS).map(([key, config]) => [key, config.limit])
  ) as Record<UsageLimits, number>

export const costModes = ['lite', 'normal', 'max', 'experimental'] as const
export type CostMode = (typeof costModes)[number]

export const getModelForMode = (
  costMode: CostMode,
  operation: 'agent' | 'file-requests' | 'check-new-files'
) => {
  if (operation === 'agent') {
    return costMode === 'experimental'
      ? models.gemini2_5_pro_exp
      : costMode === 'lite'
        ? claudeModels.haiku
        : claudeModels.sonnet
  }
  if (operation === 'file-requests') {
    return costMode === 'max' ? claudeModels.sonnet : claudeModels.haiku
  }
  if (operation === 'check-new-files') {
    return costMode === 'lite' ? models.gpt4omini : models.gpt4o
  }
  throw new Error(`Unknown operation: ${operation}`)
}

export const claudeModels = {
  sonnet: 'claude-3-5-sonnet-20241022',
  sonnet3_7: 'claude-3-7-sonnet-20250219',
  haiku: 'claude-3-5-haiku-20241022',
} as const
export type AnthropicModel = (typeof claudeModels)[keyof typeof claudeModels]

export const openaiModels = {
  gpt4_1: 'gpt-4.1-2025-04-14',
  gpt4o: 'gpt-4o-2024-11-20',
  gpt4omini: 'gpt-4o-mini-2024-07-18',
  o3mini: 'o3-mini-2025-01-31',
  o3: 'o3-2025-04-16',
  o4mini: 'o4-mini-2025-04-16',
  generatePatch:
    'ft:gpt-4o-2024-08-06:manifold-markets:generate-patch-batch2:AKYtDIhk',
} as const
export type OpenAIModel = (typeof openaiModels)[keyof typeof openaiModels]

export const geminiModels = {
  gemini2flash: 'gemini-2.0-flash-001',
  gemini2_5_pro_exp: 'gemini-2.5-pro-exp-03-25',
  gemini2_5_pro_preview: 'gemini-2.5-pro-preview-03-25',
} as const
export type GeminiModel = (typeof geminiModels)[keyof typeof geminiModels]

export const openrouterModels = {
  openrouter_gemini2_5_pro_exp: 'google/gemini-2.5-pro-exp-03-25:free',
  openrouter_gemini2_5_pro_preview: 'google/gemini-2.5-pro-preview-03-25',
} as const
export type openrouterModel =
  (typeof openrouterModels)[keyof typeof openrouterModels]

export const deepseekModels = {
  deepseekChat: 'deepseek-chat',
  deepseekReasoner: 'deepseek-reasoner',
} as const
export type DeepseekModel = (typeof deepseekModels)[keyof typeof deepseekModels]

// Vertex uses "endpoint IDs" for finetuned models, which are just integers
export const finetunedVertexModels = {
  ft_filepicker_003: '196166068534771712',
} as const
export type FinetunedVertexModel =
  (typeof finetunedVertexModels)[keyof typeof finetunedVertexModels]

export const models = {
  ...claudeModels,
  ...openaiModels,
  ...geminiModels,
  ...deepseekModels,
  ...openrouterModels,
  ...finetunedVertexModels,
} as const

export const shortModelNames = {
  'gemini-2.5-pro': models.gemini2_5_pro_preview,
  'sonnet-3.7': models.sonnet3_7,
  'sonnet-3.5': models.sonnet,
  'sonnet-3.6': models.sonnet,
  'gpt-4.1': models.gpt4_1,
  'o3-mini': models.o3mini,
  o3: models.o3,
  'o4-mini': models.o4mini,
}

export const providerModelNames = {
  [models.gemini2_5_pro_preview]: 'gemini',
  [models.gemini2_5_pro_exp]: 'gemini',
  [models.sonnet3_7]: 'anthropic',
  [models.sonnet]: 'anthropic',
  [models.gpt4_1]: 'openai',
  [models.gpt4o]: 'openai',
  [models.gpt4omini]: 'openai',
  [models.o3mini]: 'openai',
  [models.o3]: 'openai',
  [models.o4mini]: 'openai',
}

export type Model = (typeof models)[keyof typeof models]

export const TEST_USER_ID = 'test-user-id'
