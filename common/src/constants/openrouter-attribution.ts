// HTTP-Referer is required for OpenRouter to create the app attribution page.
// Categories are capped at two per request (ten per app); unknown values are
// silently ignored, so keep additions deliberate and spelling exact.
export const OPENROUTER_DEFAULT_HEADERS = {
  'HTTP-Referer': 'https://freebuff.com',
  'X-OpenRouter-Title': 'Freebuff',
  'X-OpenRouter-Categories': 'cli-agent,cloud-agent',
} as const
