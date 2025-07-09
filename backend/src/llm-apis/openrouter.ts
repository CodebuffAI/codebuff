import { Model, models } from '@codebuff/common/constants'
import { env } from '@codebuff/internal/env'
import { createOpenRouter } from '@codebuff/internal/openrouter-ai-sdk'

export function openRouterLanguageModel(model: Model) {
  const extraBody: Record<string, any> = {}
  if (model === models.openrouter_claude_sonnet_4) {
    extraBody.provider = {
      order: ['Google', 'Anthropic', 'Amazon Bedrock'],
    }
  }
  return createOpenRouter({
    apiKey: env.OPEN_ROUTER_API_KEY,
    headers: {
      'HTTP-Referer': 'https://codebuff.com',
      'X-Title': 'Codebuff',
    },
    extraBody,
  }).languageModel(model, {
    usage: { include: true },
    includeReasoning: true,
    logprobs: true,
  })
}
