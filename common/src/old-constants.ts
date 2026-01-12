import { isExplicitlyDefinedModel } from './util/model-utils'

export const PROFIT_MARGIN = 0.055

export const STOP_MARKER = '[' + 'END]'
export const FIND_FILES_MARKER = '[' + 'FIND_FILES_PLEASE]'
export const EXISTING_CODE_MARKER = '[[**REPLACE_WITH_EXISTING_CODE**]]'

// Directory where agent template override files are stored
export const AGENT_TEMPLATES_DIR = '.agents/'
export const AGENT_DEFINITION_FILE = 'agent-definition.d.ts'

export const API_KEY_ENV_VAR = 'CODEBUFF_API_KEY'

export const INVALID_AUTH_TOKEN_MESSAGE =
  'Invalid auth token. You may have been logged out from the web portal. Please log in again.'

// Allowed model prefixes for validation
export const ALLOWED_MODEL_PREFIXES = [
  'anthropic',
  'openai',
  'google',
  'x-ai',
] as const

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
  operation: 'agent' | 'file-requests' | 'check-new-files',
) => {
  if (operation === 'agent') {
    return {
      lite: models.openrouter_gemini2_5_flash,
      normal: models.openrouter_claude_sonnet_4,
      max: models.openrouter_claude_sonnet_4,
      experimental: models.openrouter_gemini2_5_pro_preview,
      ask: models.openrouter_gemini2_5_pro_preview,
    }[costMode]
  }
  if (operation === 'file-requests') {
    return {
      lite: models.openrouter_claude_3_5_haiku,
      normal: models.openrouter_claude_3_5_haiku,
      max: models.openrouter_claude_sonnet_4,
      experimental: models.openrouter_claude_sonnet_4,
      ask: models.openrouter_claude_3_5_haiku,
    }[costMode]
  }
  if (operation === 'check-new-files') {
    return {
      lite: models.openrouter_claude_3_5_haiku,
      normal: models.openrouter_claude_sonnet_4,
      max: models.openrouter_claude_sonnet_4,
      experimental: models.openrouter_claude_sonnet_4,
      ask: models.openrouter_claude_sonnet_4,
    }[costMode]
  }
  throw new Error(`Unknown operation: ${operation}`)
}

// export const claudeModels = {
//   sonnet: 'claude-sonnet-4-20250514',
//   sonnet3_7: 'claude-3-7-sonnet-20250219',
//   sonnet3_5: 'claude-3-5-sonnet-20241022',
//   opus4: 'claude-opus-4-20250514',
//   haiku: 'claude-3-5-haiku-20241022',
// } as const

export const openaiModels = {
  gpt4_1: 'gpt-4.1-2025-04-14',
  gpt4o: 'gpt-4o-2024-11-20',
  gpt4omini: 'gpt-4o-mini-2024-07-18',
  o3mini: 'o3-mini-2025-01-31',
  o3: 'o3-2025-04-16',
  o3pro: 'o3-pro-2025-06-10',
  o4mini: 'o4-mini-2025-04-16',
  generatePatch:
    'ft:gpt-4o-2024-08-06:manifold-markets:generate-patch-batch2:AKYtDIhk',
} as const
export type OpenAIModel = (typeof openaiModels)[keyof typeof openaiModels]

export const openrouterModels = {
  openrouter_claude_sonnet_4_5: 'anthropic/claude-sonnet-4.5',
  openrouter_claude_sonnet_4: 'anthropic/claude-4-sonnet-20250522',
  openrouter_claude_opus_4: 'anthropic/claude-opus-4.1',
  openrouter_claude_3_5_haiku: 'anthropic/claude-3.5-haiku-20241022',
  openrouter_claude_3_5_sonnet: 'anthropic/claude-3.5-sonnet-20240620',
  openrouter_gpt4o: 'openai/gpt-4o-2024-11-20',
  openrouter_gpt5: 'openai/gpt-5.1',
  openrouter_gpt5_chat: 'openai/gpt-5.1-chat',
  openrouter_gpt4o_mini: 'openai/gpt-4o-mini-2024-07-18',
  openrouter_gpt4_1_nano: 'openai/gpt-4.1-nano',
  openrouter_o3_mini: 'openai/o3-mini-2025-01-31',
  openrouter_gemini2_5_pro_preview: 'google/gemini-2.5-pro',
  openrouter_gemini2_5_flash: 'google/gemini-2.5-flash',
  openrouter_gemini2_5_flash_thinking:
    'google/gemini-2.5-flash-preview:thinking',
  openrouter_grok_4: 'x-ai/grok-4-07-09',
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
  ft_filepicker_010: '3808739064941641728',
  ft_filepicker_010_epoch_2: '6231675664466968576',
  ft_filepicker_topk_003: '1502192368286171136',
} as const
export const finetunedVertexModelNames: Record<string, string> = {
  [finetunedVertexModels.ft_filepicker_003]: 'ft_filepicker_003',
  [finetunedVertexModels.ft_filepicker_005]: 'ft_filepicker_005',
  [finetunedVertexModels.ft_filepicker_007]: 'ft_filepicker_007',
  [finetunedVertexModels.ft_filepicker_topk_001]: 'ft_filepicker_topk_001',
  [finetunedVertexModels.ft_filepicker_008]: 'ft_filepicker_008',
  [finetunedVertexModels.ft_filepicker_topk_002]: 'ft_filepicker_topk_002',
  [finetunedVertexModels.ft_filepicker_010]: 'ft_filepicker_010',
  [finetunedVertexModels.ft_filepicker_010_epoch_2]:
    'ft_filepicker_010_epoch_2',
  [finetunedVertexModels.ft_filepicker_topk_003]: 'ft_filepicker_topk_003',
}
export type FinetunedVertexModel =
  (typeof finetunedVertexModels)[keyof typeof finetunedVertexModels]

export const models = {
  // ...claudeModels,
  ...openaiModels,
  ...deepseekModels,
  ...openrouterModels,
  ...finetunedVertexModels,
} as const

export const shortModelNames = {
  'gemini-2.5-pro': models.openrouter_gemini2_5_pro_preview,
  'flash-2.5': models.openrouter_gemini2_5_flash,
  'opus-4': models.openrouter_claude_opus_4,
  'sonnet-4.5': models.openrouter_claude_sonnet_4_5,
  'sonnet-4': models.openrouter_claude_sonnet_4,
  'sonnet-3.7': models.openrouter_claude_sonnet_4,
  'sonnet-3.6': models.openrouter_claude_3_5_sonnet,
  'sonnet-3.5': models.openrouter_claude_3_5_sonnet,
  'gpt-4.1': models.gpt4_1,
  'o3-mini': models.o3mini,
  o3: models.o3,
  'o4-mini': models.o4mini,
  'o3-pro': models.o3pro,
}

export const providerModelNames = {
  // ...Object.fromEntries(
  //   Object.entries(openrouterModels).map(([name, model]) => [
  //     model,
  //     'claude' as const,
  //   ])
  // ),
  ...Object.fromEntries(
    Object.entries(openaiModels).map(([name, model]) => [
      model,
      'openai' as const,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(openrouterModels).map(([name, model]) => [
      model,
      'openrouter' as const,
    ]),
  ),
}

export type Model = (typeof models)[keyof typeof models] | (string & {})

export const shouldCacheModels = [
  'anthropic/claude-opus-4.1',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-haiku',
  'z-ai/glm-4.5',
  'qwen/qwen3-coder',
]
const nonCacheableModels = [
  models.openrouter_grok_4,
] satisfies string[] as string[]
export function supportsCacheControl(model: Model): boolean {
  if (model.startsWith('openai/')) {
    return true
  }
  if (model.startsWith('anthropic/')) {
    return true
  }
  if (!isExplicitlyDefinedModel(model)) {
    // Default to no cache control for unknown models
    return false
  }
  return !nonCacheableModels.includes(model)
}


export function getModelFromShortName(
  modelName: string | undefined,
): Model | undefined {
  if (!modelName) return undefined
  if (modelName && !(modelName in shortModelNames)) {
    throw new Error(
      `Unknown model: ${modelName}. Please use a valid model. Valid models are: ${Object.keys(
        shortModelNames,
      ).join(', ')}`,
    )
  }

  return shortModelNames[modelName as keyof typeof shortModelNames]
}

export const providerDomains = {
  google: 'google.com',
  anthropic: 'anthropic.com',
  openai: 'chatgpt.com',
  deepseek: 'deepseek.com',
  xai: 'x.ai',
} as const

export function getLogoForModel(modelName: string): string | undefined {
  let domain: string | undefined

  if (Object.values(openaiModels).includes(modelName as OpenAIModel))
    domain = providerDomains.openai
  else if (Object.values(deepseekModels).includes(modelName as DeepseekModel))
    domain = providerDomains.deepseek
  else if (modelName.includes('claude')) domain = providerDomains.anthropic
  else if (modelName.includes('grok')) domain = providerDomains.xai

  return domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=256`
    : undefined
}
