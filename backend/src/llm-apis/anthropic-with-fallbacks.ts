import { AnthropicModel, claudeModels, Model } from '@codebuff/common/constants'
import { CoreMessage } from 'ai'
import { logger } from '../util/logger'
import { promptAiSdkStream } from './vercel-ai-sdk/ai-sdk'
import { promptOpenRouterStream } from './openrouter-api'

export type FallbackProvider = 'openrouter'

export interface AnthropicFallbackOptions {
  messages: CoreMessage[]
  model: AnthropicModel
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
  chargeUser?: boolean
  thinkingBudget?: number
  fallbackProviders?: FallbackProvider[]
}

/**
 * Prompts an Anthropic model with fallback logic.
 *
 * Attempts to call the specified Anthropic model via the standard Anthropic API.
 * If that fails, it falls back to the configured providers in order.
 *
 * @param options - Configuration options for the API call
 * @returns An async generator that yields response chunks
 */
export async function* promptAnthropicWithFallbacks(
  options: AnthropicFallbackOptions
): AsyncGenerator<string, void, unknown> {
  const {
    model,
    fallbackProviders = ['openrouter'],
    ...streamOptions
  } = options

  // Try primary Anthropic API first with retries
  try {
    yield* promptAiSdkStream({
      ...streamOptions,
      model,
      maxRetries: 3, // Use AI SDK's built-in retry
    })
    return
  } catch (error) {}

  // Try fallback providers in order
  for (const provider of fallbackProviders) {
    try {
      if (provider === 'openrouter') {
        yield* promptOpenRouterStream({
          ...streamOptions,
          model,
          maxRetries: 2, // Fewer retries for fallbacks
        })
        return
      } else {
        // Skip unsupported providers
        logger.warn({ provider }, '⚠️  SKIPPING: Unsupported fallback provider')
        continue
      }
    } catch (fallbackError) {
      logger.warn(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
          provider,
          model,
        },
        `❌ ${provider} failed`
      )
      continue
    }
  }

  // If all fallbacks fail, throw the original error
  throw new Error(
    `All providers failed for model ${model}. Tried: Anthropic${fallbackProviders.map((p) => `, ${p}`).join('')}`
  )
}
