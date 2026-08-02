/**
 * Builds the language model every request runs on: the Codebuff backend,
 * which forwards to OpenRouter.
 */

import path from 'path'

import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import { FREEBUFF_ACTING_USER_HEADER } from '@codebuff/common/constants/freebuff-models'
import { isTransientNetworkError } from '@codebuff/common/util/error'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@codebuff/llm-providers/openai-compatible'
import { APICallError } from 'ai'

import { getWebsiteUrl } from '../constants'
import { getByokOpenrouterApiKeyFromEnv } from '../env'

import type { LanguageModel } from 'ai'

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Codebuff API key for backend authentication */
  apiKey: string
  /** Model ID (OpenRouter format, e.g., "anthropic/claude-sonnet-4") */
  model: string
  /** End user represented by a trusted service-account request. */
  userId?: string
}

// Usage accounting type for OpenRouter/Codebuff backend responses
type OpenRouterUsageAccounting = {
  cost: number | null
  costDetails: {
    upstreamInferenceCost: number | null
  }
}

/**
 * Wrap global fetch so transient connection failures (socket closed/reset,
 * connection refused) are rethrown as retryable APICallErrors.
 *
 * Bun's fetch throws these as plain Errors ("The socket connection was closed
 * unexpectedly...", code ECONNRESET/ConnectionClosed), which the AI SDK does
 * not recognize as retryable — it only auto-retries APICallError with
 * isRetryable=true. Marking them retryable lets streamText's built-in
 * exponential backoff (default 2 retries) absorb brief server/network blips
 * instead of failing the whole agent run.
 */
function fetchWithRetryableNetworkErrors(
  ...args: Parameters<typeof globalThis.fetch>
): ReturnType<typeof globalThis.fetch> {
  return globalThis.fetch(...args).catch((error: unknown) => {
    if (isTransientNetworkError(error)) {
      const input = args[0]
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      throw new APICallError({
        message: error instanceof Error ? error.message : String(error),
        cause: error,
        url,
        requestBodyValues: {},
        isRetryable: true,
      })
    }
    throw error
  })
}

/**
 * Get the model for a request: one that routes through the Codebuff backend,
 * which forwards to OpenRouter.
 */
export function getModelForRequest({
  apiKey,
  model,
  userId,
}: ModelRequestParams): LanguageModel {
  const openrouterUsage: OpenRouterUsageAccounting = {
    cost: null,
    costDetails: {
      upstreamInferenceCost: null,
    },
  }

  const openrouterApiKey = getByokOpenrouterApiKeyFromEnv()

  return new OpenAICompatibleChatLanguageModel(model, {
    provider: 'codebuff',
    url: ({ path: endpoint }) =>
      new URL(path.join('/api/v1', endpoint), getWebsiteUrl()).toString(),
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codebuff`,
      ...(userId ? { [FREEBUFF_ACTING_USER_HEADER]: userId } : {}),
      ...(openrouterApiKey && { [BYOK_OPENROUTER_HEADER]: openrouterApiKey }),
    }),
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }: { parsedBody: any }) => {
        if (openrouterApiKey !== undefined) {
          return { codebuff: { usage: openrouterUsage } }
        }

        if (typeof parsedBody?.usage?.cost === 'number') {
          openrouterUsage.cost = parsedBody.usage.cost
        }
        if (
          typeof parsedBody?.usage?.cost_details?.upstream_inference_cost ===
          'number'
        ) {
          openrouterUsage.costDetails.upstreamInferenceCost =
            parsedBody.usage.cost_details.upstream_inference_cost
        }
        return { codebuff: { usage: openrouterUsage } }
      },
      createStreamExtractor: () => ({
        processChunk: (parsedChunk: any) => {
          if (openrouterApiKey !== undefined) {
            return
          }

          if (typeof parsedChunk?.usage?.cost === 'number') {
            openrouterUsage.cost = parsedChunk.usage.cost
          }
          if (
            typeof parsedChunk?.usage?.cost_details?.upstream_inference_cost ===
            'number'
          ) {
            openrouterUsage.costDetails.upstreamInferenceCost =
              parsedChunk.usage.cost_details.upstream_inference_cost
          }
        },
        buildMetadata: () => {
          return { codebuff: { usage: openrouterUsage } }
        },
      }),
    },
    // Cast: Bun's fetch type also declares a `preconnect` helper, but the AI
    // SDK only ever invokes fetch as a plain function.
    fetch: fetchWithRetryableNetworkErrors as typeof globalThis.fetch,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}
