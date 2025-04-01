export const ALGORITHM = 'aes-256-gcm'
export const IV_LENGTH = 12
export const AUTH_TAG_LENGTH = 16

// --- Constants for API Key Validation ---
export const KEY_PREFIXES = {
  anthropic: 'sk-ant-api03-',
  gemini: 'AIzaSy',
  openai: 'sk-proj-',
}
export const KEY_LENGTHS = {
  anthropic: 108,
  gemini: 39,
  openai: 164,
}
