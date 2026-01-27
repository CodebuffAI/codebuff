/**
 * Codex OAuth constants for connecting to user's ChatGPT Plus/Pro subscription.
 * These are used by the CLI for the OAuth PKCE flow and by the SDK for direct OpenAI API calls.
 */

// OAuth client ID used by Codex CLI (same as official OpenAI Codex CLI)
// This is the public client ID for the Codex CLI OAuth flow
export const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

// OpenAI OAuth endpoints
export const CODEX_OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
export const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

// OpenAI API endpoint for direct calls (standard API, not ChatGPT backend)
export const OPENAI_API_BASE_URL = 'https://api.openai.com'

// ChatGPT backend API endpoint for Codex requests
export const CHATGPT_BACKEND_API_URL = 'https://chatgpt.com/backend-api'

// Environment variable for OAuth token override
export const CODEX_OAUTH_TOKEN_ENV_VAR = 'CODEBUFF_CODEX_OAUTH_TOKEN'

// OAuth scopes needed for ChatGPT Plus/Pro access
export const CODEX_OAUTH_SCOPES = 'openid profile email offline_access'

// Redirect URI for OAuth callback (local server)
export const CODEX_OAUTH_REDIRECT_URI = 'http://localhost:1455/auth/callback'

/**
 * Models that can use Codex OAuth (ChatGPT Plus/Pro subscription).
 * These models are supported via the ChatGPT backend API.
 */
export const CODEX_OAUTH_MODELS = [
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.1',
] as const

/**
 * Model ID mapping from various formats to normalized Codex API model names.
 * Based on the opencode implementation's model map.
 * Maps OpenRouter-style IDs and legacy names to the normalized API model names.
 */
export const CODEX_MODEL_MAP: Record<string, string> = {
  // OpenRouter format
  'openai/gpt-5.2-codex': 'gpt-5.2-codex',
  'openai/gpt-5.2': 'gpt-5.2',
  'openai/gpt-5.1-codex': 'gpt-5.1-codex',
  'openai/gpt-5.1-codex-max': 'gpt-5.1-codex-max',
  'openai/gpt-5.1-codex-mini': 'gpt-5.1-codex-mini',
  'openai/gpt-5.1': 'gpt-5.1',
  // Direct model names
  'gpt-5.2-codex': 'gpt-5.2-codex',
  'gpt-5.2': 'gpt-5.2',
  'gpt-5.1-codex': 'gpt-5.1-codex',
  'gpt-5.1-codex-max': 'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini': 'gpt-5.1-codex-mini',
  'gpt-5.1': 'gpt-5.1',
  // Legacy mappings (gpt-5 -> gpt-5.1)
  'gpt-5-codex': 'gpt-5.1-codex',
  'gpt-5': 'gpt-5.1',
  'openai/gpt-5-codex': 'gpt-5.1-codex',
  'openai/gpt-5': 'gpt-5.1',
}

/**
 * Check if a model is an OpenAI model that can use Codex OAuth.
 * Matches models in the CODEX_MODEL_MAP or with openai/ prefix.
 */
export function isOpenAIModel(model: string): boolean {
  // Check if it's in the model map
  if (CODEX_MODEL_MAP[model]) {
    return true
  }
  // Check if it has openai/ prefix
  if (model.startsWith('openai/')) {
    return true
  }
  // Check if it's a known Codex model
  const modelId = model.startsWith('openai/') ? model.slice(7) : model
  return (CODEX_OAUTH_MODELS as readonly string[]).includes(modelId)
}

/**
 * Normalize a model ID to the Codex API format.
 * Uses the model map for known models, with fallback pattern matching.
 */
export function toCodexModelId(model: string): string {
  // Check the mapping table first
  const mapped = CODEX_MODEL_MAP[model]
  if (mapped) {
    return mapped
  }

  // Strip provider prefix if present
  const modelId = model.includes('/') ? model.split('/').pop()! : model

  // Check again without prefix
  const mappedWithoutPrefix = CODEX_MODEL_MAP[modelId]
  if (mappedWithoutPrefix) {
    return mappedWithoutPrefix
  }

  // Pattern-based fallback for unknown models
  const normalized = modelId.toLowerCase()

  // GPT-5.2 Codex
  if (normalized.includes('gpt-5.2-codex') || normalized.includes('gpt 5.2 codex')) {
    return 'gpt-5.2-codex'
  }
  // GPT-5.2
  if (normalized.includes('gpt-5.2') || normalized.includes('gpt 5.2')) {
    return 'gpt-5.2'
  }
  // GPT-5.1 Codex Max
  if (normalized.includes('gpt-5.1-codex-max') || normalized.includes('codex-max')) {
    return 'gpt-5.1-codex-max'
  }
  // GPT-5.1 Codex Mini
  if (normalized.includes('gpt-5.1-codex-mini') || normalized.includes('codex-mini')) {
    return 'gpt-5.1-codex-mini'
  }
  // GPT-5.1 Codex
  if (normalized.includes('gpt-5.1-codex') || normalized.includes('gpt 5.1 codex')) {
    return 'gpt-5.1-codex'
  }
  // GPT-5.1
  if (normalized.includes('gpt-5.1') || normalized.includes('gpt 5.1')) {
    return 'gpt-5.1'
  }
  // Any codex model defaults to gpt-5.1-codex
  if (normalized.includes('codex')) {
    return 'gpt-5.1-codex'
  }
  // GPT-5 family defaults to gpt-5.1
  if (normalized.includes('gpt-5') || normalized.includes('gpt 5')) {
    return 'gpt-5.1'
  }

  // Default fallback
  return 'gpt-5.1'
}

/**
 * @deprecated Use toCodexModelId instead
 */
export function toOpenAIModelId(openrouterModel: string): string {
  return toCodexModelId(openrouterModel)
}
