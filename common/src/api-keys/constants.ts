export const ALGORITHM = 'aes-256-gcm'
export const IV_LENGTH = 12
export const AUTH_TAG_LENGTH = 16

// --- Define valid API Key Types ---
// Used by db/schema.ts to define the pgEnum
// and by crypto.ts for type safety.
export const API_KEY_TYPES = ['anthropic', 'gemini', 'openai'] as const
export type ApiKeyType = (typeof API_KEY_TYPES)[number] // Derive the type from the constant

export const KEY_PREFIXES: Record<ApiKeyType, string> = {
  anthropic: 'sk-ant-api03-',
  gemini: 'AIzaSy',
  openai: 'sk-proj-',
}
export const KEY_LENGTHS: Record<ApiKeyType, number> = {
  anthropic: 108,
  gemini: 39,
  openai: 164,
}

export const READABLE_NAME: Record<ApiKeyType, string> = {
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  openai: 'Open AI',
}
