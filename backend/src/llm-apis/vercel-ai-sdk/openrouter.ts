import { createOpenAI } from '@ai-sdk/openai'
import { env } from '@codebuff/internal/env'

/**
 * Create OpenRouter provider using OpenAI-compatible API
 */
export const openrouter = createOpenAI({
  name: 'openrouter',
  apiKey: env.OPEN_ROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': 'https://codebuff.com',
    'X-Title': 'Codebuff',
  },
})
