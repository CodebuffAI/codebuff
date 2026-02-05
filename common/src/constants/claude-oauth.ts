/**
 * Claude Code OAuth constants for connecting to user's Claude Pro/Max subscription.
 * These are used by the CLI for the OAuth PKCE flow and by the SDK for direct Anthropic API calls.
 */

// OAuth client ID used by Claude Code and third-party apps like opencode
export const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'

// Anthropic OAuth endpoints
export const CLAUDE_OAUTH_AUTHORIZE_URL = 'https://console.anthropic.com/oauth/authorize'
export const CLAUDE_OAUTH_TOKEN_URL = 'https://console.anthropic.com/oauth/token'

// Anthropic API endpoint for direct calls
export const ANTHROPIC_API_BASE_URL = 'https://api.anthropic.com'

// Environment variable for OAuth token override
export const CLAUDE_OAUTH_TOKEN_ENV_VAR = 'CODEBUFF_CLAUDE_OAUTH_TOKEN'

// Required Anthropic API version header
export const ANTHROPIC_API_VERSION = '2023-06-01'

/**
 * Beta headers required for Claude OAuth access to Claude 4+ models.
 * These must be included in the anthropic-beta header when making requests.
 */
export const CLAUDE_OAUTH_BETA_HEADERS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
] as const

/**
 * System prompt prefix required by Anthropic to allow OAuth access to Claude 4+ models.
 * This must be prepended to the system prompt when using Claude OAuth with Claude 4+ models.
 * Without this prefix, requests will fail with "This credential is only authorized for use with Claude Code".
 */
export const CLAUDE_CODE_SYSTEM_PROMPT_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude."

/**
 * Model ID mapping from OpenRouter format to Anthropic format.
 * OpenRouter uses prefixed IDs like "anthropic/claude-sonnet-4",
 * while Anthropic uses versioned IDs like "claude-3-5-haiku-20241022".
 */
export const OPENROUTER_TO_ANTHROPIC_MODEL_MAP: Record<string, string> = {
  // Claude 3.x Haiku models
  'anthropic/claude-3.5-haiku-20241022': 'claude-3-5-haiku-20241022',
  'anthropic/claude-3.5-haiku': 'claude-3-5-haiku-20241022',
  'anthropic/claude-3-5-haiku': 'claude-3-5-haiku-20241022',
  'anthropic/claude-3-5-haiku-20241022': 'claude-3-5-haiku-20241022',
  'anthropic/claude-3-haiku': 'claude-3-haiku-20240307',

  // Claude 3.x Sonnet models
  'anthropic/claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
  'anthropic/claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
  'anthropic/claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-20241022',
  'anthropic/claude-3-5-sonnet-20240620': 'claude-3-5-sonnet-20240620',
  'anthropic/claude-3-sonnet': 'claude-3-sonnet-20240229',

  // Claude 3.x Opus models
  'anthropic/claude-3-opus': 'claude-3-opus-20240229',
  'anthropic/claude-3-opus-20240229': 'claude-3-opus-20240229',

  // Claude 4.x Haiku models
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'anthropic/claude-haiku-4': 'claude-haiku-4-20250514',

  // Claude 4.x Sonnet models
  'anthropic/claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'anthropic/claude-sonnet-4': 'claude-sonnet-4-20250514',
  'anthropic/claude-4-sonnet-20250522': 'claude-sonnet-4-20250514',
  'anthropic/claude-4-sonnet': 'claude-sonnet-4-20250514',

  // Claude 4.x Opus models
  'anthropic/claude-opus-4.6': 'claude-opus-4-6',
  'anthropic/claude-opus-4.5': 'claude-opus-4-5-20251101',
  'anthropic/claude-opus-4.1': 'claude-opus-4-1-20250805',
  'anthropic/claude-opus-4': 'claude-opus-4-1-20250805',
}

/**
 * Check if a model is a Claude/Anthropic model that can use OAuth.
 */
export function isClaudeModel(model: string): boolean {
  return model.startsWith('anthropic/') || model.startsWith('claude-')
}

/**
 * Convert an OpenRouter model ID to an Anthropic model ID.
 * Throws an error if the model has a provider prefix but is not an Anthropic model.
 */
export function toAnthropicModelId(openrouterModel: string): string {
  // If it's already an Anthropic model ID (no prefix), return as-is
  if (!openrouterModel.includes('/')) {
    return openrouterModel
  }

  // Require anthropic/ prefix for OpenRouter model IDs
  if (!openrouterModel.startsWith('anthropic/')) {
    throw new Error(
      `Cannot convert non-Anthropic model to Anthropic model ID: ${openrouterModel}`,
    )
  }

  // Check the mapping table
  const mapped = OPENROUTER_TO_ANTHROPIC_MODEL_MAP[openrouterModel]
  if (mapped) {
    return mapped
  }

  // Fallback: strip the "anthropic/" prefix
  return openrouterModel.replace('anthropic/', '')
}
