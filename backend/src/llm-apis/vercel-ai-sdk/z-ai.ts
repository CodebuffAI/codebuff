import { createOpenAI } from '@ai-sdk/openai'
import { env } from '@codebuff/internal/env'

/**
 * Create Z.ai provider using OpenAI-compatible API
 */
export const zAi = createOpenAI({
  name: 'z-ai',
  apiKey: env.Z_AI_API_KEY,
  baseURL: env.Z_AI_BASE_URL,
  headers: {
    'HTTP-Referer': 'https://codebuff.com',
    'X-Title': 'Codebuff',
  },
})