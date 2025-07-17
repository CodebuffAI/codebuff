import { Model, models } from '@codebuff/common/constants'
import { env } from '@codebuff/internal/env'
import { createOpenRouter } from '@codebuff/internal/openrouter-ai-sdk'

// Provider routing documentation: https://openrouter.ai/docs/features/provider-routing
const providerOrder = {
  [models.openrouter_claude_sonnet_4]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_opus_4]: ['Google', 'Anthropic'],
} as const

export function openRouterLanguageModel(model: Model) {
  const extraBody: Record<string, any> = {}
  if (model in providerOrder) {
    extraBody.provider = {
      order: providerOrder[model as keyof typeof providerOrder],
      allow_fallbacks: false,
    }
  }

  // Use nitro flag for kimi-k2 to get fastest provider
  const modelWithFlags =
    model === models.openrouter_kimi_k2 ? `${model}:nitro` : model

  return createOpenRouter({
    apiKey: env.OPEN_ROUTER_API_KEY,
    headers: {
      'HTTP-Referer': 'https://codebuff.com',
      'X-Title': 'Codebuff',
    },
    extraBody,
  }).languageModel(modelWithFlags, {
    usage: { include: true },
    includeReasoning: true,
    logprobs: true,
  })
}
