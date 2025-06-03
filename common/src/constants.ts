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
export const CREDITS_REFERRAL_BONUS = 250
export const AFFILIATE_USER_REFFERAL_LIMIT = 500

// Default number of free credits granted per cycle
export const DEFAULT_FREE_CREDITS_GRANT = 500

// Credit pricing configuration
export const CREDIT_PRICING = {
  CENTS_PER_CREDIT: 1, // 1 credit = 1 cent = $0.01
  MIN_PURCHASE_CREDITS: 100, // $1.00 minimum
  DISPLAY_RATE: '$0.01 per credit',
} as const

export const AuthState = {
  LOGGED_OUT: 'LOGGED_OUT',
  LOGGED_IN: 'LOGGED_IN',
} as const

export type AuthState = (typeof AuthState)[keyof typeof AuthState]

export const UserState = {
  LOGGED_OUT: 'LOGGED_OUT',
  GOOD_STANDING: 'GOOD_STANDING', // >= 100 credits
  ATTENTION_NEEDED: 'ATTENTION_NEEDED', // 20-99 credits
  CRITICAL: 'CRITICAL', // 1-19 credits
  DEPLETED: 'DEPLETED', // <= 0 credits
} as const

export type UserState = (typeof UserState)[keyof typeof UserState]

export function getUserState(isLoggedIn: boolean, credits: number): UserState {
  if (!isLoggedIn) return UserState.LOGGED_OUT

  if (credits >= 100) return UserState.GOOD_STANDING
  if (credits >= 20) return UserState.ATTENTION_NEEDED
  if (credits >= 1) return UserState.CRITICAL
  return UserState.DEPLETED
}

export const costModes = [
  'lite',
  'normal',
  'max',
  'experimental',
  'ask',
] as const
export type CostMode = (typeof costModes)[number]

export const getModelForMode = (
  costMode: CostMode,
  operation: 'agent' | 'file-requests' | 'check-new-files'
) => {
  if (operation === 'agent') {
    return {
      lite: models.gemini2_5_flash,
      normal: models.sonnet,
      max: models.sonnet,
      experimental: models.gemini2_5_pro_preview,
      ask: models.gemini2_5_pro_preview,
    }[costMode]
  }
  if (operation === 'file-requests') {
    return {
      lite: claudeModels.haiku,
      normal: claudeModels.haiku,
      max: claudeModels.sonnet,
      experimental: claudeModels.sonnet,
      ask: claudeModels.haiku,
    }[costMode]
  }
  if (operation === 'check-new-files') {
    return {
      lite: models.gpt4omini,
      normal: models.gpt4o,
      max: models.gpt4o,
      experimental: models.gpt4o,
      ask: models.gpt4o,
    }[costMode]
  }
  throw new Error(`Unknown operation: ${operation}`)
}

export const claudeModels = {
  sonnet: 'claude-sonnet-4-20250514',
  sonnet3_7: 'claude-3-7-sonnet-20250219',
  opus4: 'claude-opus-4-20250514',
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
  gemini2_5_flash: 'gemini-2.5-flash-preview-05-20',
  gemini2_5_flash_thinking: 'gemini-2.5-flash-preview-05-20:thinking',
  gemini2flash: 'gemini-2.0-flash-001',
  gemini2_5_pro_exp: 'gemini-2.5-pro-exp-03-25',
  gemini2_5_pro_preview: 'gemini-2.5-pro-preview-05-06',
} as const
export type GeminiModel = (typeof geminiModels)[keyof typeof geminiModels]

export const openrouterModels = {
  openrouter_gemini2_5_pro_exp: 'google/gemini-2.5-pro-exp-03-25:free',
  openrouter_gemini2_5_pro_preview: 'google/gemini-2.5-pro-preview-03-25',
  openrouter_gemini2_5_flash: 'google/gemini-2.5-flash-preview',
  openrouter_gemini2_5_flash_thinking:
    'google/gemini-2.5-flash-preview:thinking',
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
  ft_filepicker_005: '8493203957034778624',
  ft_filepicker_007: '2589952415784501248',
  ft_filepicker_topk_001: '3676445825887633408',
  ft_filepicker_008: '2672143108984012800',
  ft_filepicker_topk_002: '1694861989844615168',
} as const
export const finetunedVertexModelNames: Record<string, string> = {
  [finetunedVertexModels.ft_filepicker_003]: 'ft_filepicker_003',
  [finetunedVertexModels.ft_filepicker_005]: 'ft_filepicker_005',
  [finetunedVertexModels.ft_filepicker_007]: 'ft_filepicker_007',
  [finetunedVertexModels.ft_filepicker_topk_001]: 'ft_filepicker_topk_001',
  [finetunedVertexModels.ft_filepicker_008]: 'ft_filepicker_008',
  [finetunedVertexModels.ft_filepicker_topk_002]: 'ft_filepicker_topk_002',
}
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
  [models.gemini2flash]: 'gemini',
  [models.gemini2_5_flash]: 'gemini',
  [models.gemini2_5_flash_thinking]: 'gemini',
  [models.haiku]: 'anthropic',
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
