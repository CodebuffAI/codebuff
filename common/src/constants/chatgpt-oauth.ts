/**
 * ChatGPT subscription OAuth constants for experimental direct OpenAI routing.
 */

/**
 * Feature flag for ChatGPT OAuth (connect:chatgpt) functionality.
 * Default OFF until validated.
 */
export const CHATGPT_OAUTH_ENABLED = true

/** OAuth client id used by Codex-compatible OAuth ecosystems. */
export const CHATGPT_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

/** OAuth endpoints */
export const CHATGPT_OAUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
export const CHATGPT_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'

/** Pinned redirect URI for paste-based localhost callback flow. */
export const CHATGPT_OAUTH_REDIRECT_URI = 'http://localhost:1455/auth/callback'

/** Base URL for ChatGPT backend API (Codex endpoint). */
export const CHATGPT_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api'

/** Environment variable for OAuth token override. */
export const CHATGPT_OAUTH_TOKEN_ENV_VAR = 'CODEBUFF_CHATGPT_OAUTH_TOKEN'

/**
 * OpenRouter-style model IDs that are allowed for ChatGPT OAuth direct routing.
 * This includes optimistic aliases requested by the user.
 */
export const OPENROUTER_TO_OPENAI_MODEL_MAP: Record<string, string> = {
  'openai/gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.4-codex': 'gpt-5.4-codex',
  'openai/gpt-5.3': 'gpt-5.3',
  'openai/gpt-5.3-codex': 'gpt-5.3-codex',
  'openai/gpt-5.2': 'gpt-5.2',
  'openai/gpt-5.2-codex': 'gpt-5.2-codex',

  // Nearby/optimistic aliases supported in current model config.
  'openai/gpt-5.1': 'gpt-5.1',
  'openai/gpt-5.1-chat': 'gpt-5.1-chat',
  'openai/gpt-4o-2024-11-20': 'gpt-4o-2024-11-20',
  'openai/gpt-4o-mini-2024-07-18': 'gpt-4o-mini-2024-07-18',
}

export const CHATGPT_OAUTH_OPENAI_MODEL_ALLOWLIST = Object.keys(
  OPENROUTER_TO_OPENAI_MODEL_MAP,
) as Array<keyof typeof OPENROUTER_TO_OPENAI_MODEL_MAP>

export function isOpenAIProviderModel(model: string): boolean {
  return model.startsWith('openai/')
}

/**
 * Check if model is in the explicit ChatGPT OAuth allowlist.
 */
export function isChatGptOAuthModelAllowed(model: string): boolean {
  return model in OPENROUTER_TO_OPENAI_MODEL_MAP
}

/**
 * Normalize OpenRouter-style model IDs to direct OpenAI model IDs.
 * Example: "openai/gpt-5.3-codex" => "gpt-5.3-codex"
 */
export function toOpenAIModelId(model: string): string {
  if (!model.includes('/')) {
    return model
  }

  if (!model.startsWith('openai/')) {
    throw new Error(
      `Cannot convert non-OpenAI model to OpenAI model ID: ${model}`,
    )
  }

  const mapped = OPENROUTER_TO_OPENAI_MODEL_MAP[model]
  if (mapped) {
    return mapped
  }

  throw new Error(`Model is not supported for ChatGPT OAuth direct routing: ${model}`)
}
