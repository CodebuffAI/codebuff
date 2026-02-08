/**
 * Model provider abstraction for routing requests to the appropriate LLM provider.
 *
 * This module handles:
 * - Claude OAuth: Direct requests to Anthropic API using user's OAuth token
 * - Default: Requests through Codebuff backend (which routes to OpenRouter)
 */

import path from 'path'

import { createAnthropic } from '@ai-sdk/anthropic'
import { BYOK_OPENROUTER_HEADER } from '@codebuff/common/constants/byok'
import {
  ANTHROPIC_API_BASE_URL,
  CLAUDE_CODE_SYSTEM_PROMPT_PREFIX,
  CLAUDE_OAUTH_BETA_HEADERS,
  isClaudeModel,
  toAnthropicModelId,
} from '@codebuff/common/constants/claude-oauth'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@codebuff/internal/openai-compatible/index'

import { WEBSITE_URL } from '../constants'
import { getValidClaudeOAuthCredentials } from '../credentials'
import {
  getByokAnthropicApiKeyFromEnv,
  getByokAnthropicBaseUrlFromEnv,
  getByokAnthropicModelsFromEnv,
  getByokOpenrouterApiKeyFromEnv,
} from '../env'

import type { LanguageModel } from 'ai'

// ============================================================================
// Claude OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when Claude OAuth rate limit expires, or null if not rate-limited */
let claudeOAuthRateLimitedUntil: number | null = null

/**
 * Mark Claude OAuth as rate-limited. Subsequent requests will skip Claude OAuth
 * and use Codebuff backend until the reset time.
 * @param resetAt - When the rate limit resets. If not provided, guesses 5 minutes from now.
 */
export function markClaudeOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  claudeOAuthRateLimitedUntil = resetAt ? resetAt.getTime() : fiveMinutesFromNow
}

/**
 * Check if Claude OAuth is currently rate-limited.
 * Returns true if rate-limited and reset time hasn't passed.
 */
export function isClaudeOAuthRateLimited(): boolean {
  if (claudeOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= claudeOAuthRateLimitedUntil) {
    // Rate limit expired, clear the cache
    claudeOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the Claude OAuth rate limit cache.
 * Call this when user reconnects their Claude subscription.
 */
export function resetClaudeOAuthRateLimit(): void {
  claudeOAuthRateLimitedUntil = null
}

// ============================================================================
// Claude OAuth Quota Fetching
// ============================================================================

interface ClaudeQuotaWindow {
  utilization: number
  resets_at: string | null
}

interface ClaudeQuotaResponse {
  five_hour: ClaudeQuotaWindow | null
  seven_day: ClaudeQuotaWindow | null
  seven_day_oauth_apps: ClaudeQuotaWindow | null
  seven_day_opus: ClaudeQuotaWindow | null
}

/**
 * Fetch the rate limit reset time from Anthropic's quota API.
 * Returns the earliest reset time (whichever limit is more restrictive).
 * Returns null if fetch fails or no reset time is available.
 */
export async function fetchClaudeOAuthResetTime(accessToken: string): Promise<Date | null> {
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219',
      },
    })

    if (!response.ok) {
      return null
    }

    const responseBody = await response.json()
    const data = responseBody as ClaudeQuotaResponse

    // Parse reset times
    const fiveHour = data.five_hour
    const sevenDay = data.seven_day

    const fiveHourRemaining = fiveHour ? Math.max(0, 100 - fiveHour.utilization) : 100
    const sevenDayRemaining = sevenDay ? Math.max(0, 100 - sevenDay.utilization) : 100

    // Return the reset time for whichever limit is more restrictive (lower remaining)
    if (fiveHourRemaining <= sevenDayRemaining && fiveHour?.resets_at) {
      return new Date(fiveHour.resets_at)
    } else if (sevenDay?.resets_at) {
      return new Date(sevenDay.resets_at)
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Codebuff API key for backend authentication */
  apiKey: string
  /** Model ID (OpenRouter format, e.g., "anthropic/claude-sonnet-4") */
  model: string
  /** If true, skip Claude OAuth and use Codebuff backend (for fallback after rate limit) */
  skipClaudeOAuth?: boolean
}

/**
 * Result from getModelForRequest.
 */
export interface ModelResult {
  /** The language model to use for requests */
  model: LanguageModel
  /** Whether this model uses Claude OAuth direct (affects cost tracking) */
  isClaudeOAuth: boolean
  /** Whether this model uses BYOK Anthropic API key (affects cost tracking) */
  isByokAnthropic: boolean
}

// Usage accounting type for OpenRouter/Codebuff backend responses
type OpenRouterUsageAccounting = {
  cost: number | null
  costDetails: {
    upstreamInferenceCost: number | null
  }
}

/**
 * Get the appropriate model for a request.
 *
 * If Claude OAuth credentials are available and the model is a Claude model,
 * returns an Anthropic direct model. Otherwise, returns the Codebuff backend model.
 * 
 * This function is async because it may need to refresh the OAuth token.
 */
export async function getModelForRequest(params: ModelRequestParams): Promise<ModelResult> {
  const { apiKey, model, skipClaudeOAuth } = params

  // Priority 1: BYOK Anthropic (user's own API key + optional proxy)
  if (isClaudeModel(model)) {
    const byokApiKey = getByokAnthropicApiKeyFromEnv()
    if (byokApiKey) {
      const byokBaseUrl = getByokAnthropicBaseUrlFromEnv() ?? ANTHROPIC_API_BASE_URL
      const byokModelsConfig = getByokAnthropicModelsFromEnv()
      return {
        model: createByokAnthropicModel(model, byokApiKey, byokBaseUrl, byokModelsConfig),
        isClaudeOAuth: false,
        isByokAnthropic: true,
      }
    }
  }

  // Priority 2: Claude OAuth direct
  // Skip if explicitly requested, if rate-limited, or if not a Claude model
  if (!skipClaudeOAuth && !isClaudeOAuthRateLimited() && isClaudeModel(model)) {
    // Get valid credentials (will refresh if needed)
    const claudeOAuthCredentials = await getValidClaudeOAuthCredentials()
    if (claudeOAuthCredentials) {
      return {
        model: createAnthropicOAuthModel(
          model,
          claudeOAuthCredentials.accessToken,
        ),
        isClaudeOAuth: true,
        isByokAnthropic: false,
      }
    }
  }

  // Priority 3: Codebuff backend
  return {
    model: createCodebuffBackendModel(apiKey, model),
    isClaudeOAuth: false,
    isByokAnthropic: false,
  }
}

/**
 * Resolve the model ID for BYOK Anthropic requests.
 * Supports optional model aliases (e.g., "haiku:claude-sonnet-4-5,sonnet:claude-sonnet-4-5-thinking")
 * that map model tiers to custom model IDs on the user's proxy.
 */
function resolveByokModelId(model: string, modelsConfig: string | undefined): string {
  const anthropicId = toAnthropicModelId(model)

  if (!modelsConfig) return anthropicId

  const aliases: Record<string, string> = {}
  for (const pair of modelsConfig.split(',')) {
    const colonIndex = pair.indexOf(':')
    if (colonIndex > 0) {
      const alias = pair.slice(0, colonIndex).trim()
      const target = pair.slice(colonIndex + 1).trim()
      if (alias && target) aliases[alias] = target
    }
  }

  const lowerModel = model.toLowerCase()
  if (lowerModel.includes('opus') && aliases.opus) return aliases.opus
  if (lowerModel.includes('sonnet') && aliases.sonnet) return aliases.sonnet
  if (lowerModel.includes('haiku') && aliases.haiku) return aliases.haiku

  return anthropicId
}

/**
 * Create an Anthropic model that uses the user's own API key and optional custom base URL.
 * This routes requests to the user's proxy or directly to Anthropic with their key.
 */
function createByokAnthropicModel(
  model: string,
  apiKey: string,
  baseURL: string,
  modelsConfig: string | undefined,
): LanguageModel {
  const resolvedModelId = resolveByokModelId(model, modelsConfig)

  // The @ai-sdk/anthropic SDK appends "/messages" to baseURL.
  // Most proxies serve at /v1/messages, so ensure the URL ends with /v1.
  let normalizedBaseURL = baseURL.replace(/\/+$/, '')
  if (!normalizedBaseURL.endsWith('/v1')) {
    normalizedBaseURL += '/v1'
  }

  const anthropic = createAnthropic({
    apiKey,
    baseURL: normalizedBaseURL,
  })

  return anthropic(resolvedModelId) as unknown as LanguageModel
}

/**
 * Create an Anthropic model that uses OAuth Bearer token authentication.
 */
function createAnthropicOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel {
  // Convert OpenRouter model ID to Anthropic model ID
  const anthropicModelId = toAnthropicModelId(model)

  // Create Anthropic provider with custom fetch to use Bearer token auth
  // Custom fetch to handle OAuth Bearer token authentication and system prompt transformation
  const customFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers)

    // Remove the x-api-key header that the SDK adds
    headers.delete('x-api-key')

    // Add Bearer token authentication (for OAuth)
    headers.set('Authorization', `Bearer ${oauthToken}`)

    // Add required beta headers for OAuth (same as opencode)
    // These beta headers are required to access Claude 4+ models with OAuth
    const existingBeta = headers.get('anthropic-beta') ?? ''
    const betaList = existingBeta
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)
    const mergedBetas = [
      ...new Set([...CLAUDE_OAUTH_BETA_HEADERS, ...betaList]),
    ].join(',')
    headers.set('anthropic-beta', mergedBetas)

    // Transform the request body to use the correct system prompt format for Claude OAuth
    // Anthropic requires the system prompt to be split into two separate blocks:
    // 1. First block: Claude Code identifier (required for OAuth access)
    // 2. Second block: The actual system prompt (if any)
    let modifiedInit = init
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body)
        // Always inject the Claude Code identifier for OAuth requests
        // Extract existing system prompt if present
        const existingSystem = body.system
          ? Array.isArray(body.system)
            ? body.system
                .map(
                  (s: { text?: string; content?: string }) =>
                    s.text ?? s.content ?? '',
                )
                .join('\n\n')
            : typeof body.system === 'string'
              ? body.system
              : ''
          : ''

        // Build the system array with Claude Code identifier first
        body.system = [
          {
            type: 'text',
            text: CLAUDE_CODE_SYSTEM_PROMPT_PREFIX,
          },
          // Only add second block if there's actual content
          ...(existingSystem
            ? [
                {
                  type: 'text',
                  text: existingSystem,
                },
              ]
            : []),
        ]
        modifiedInit = { ...init, body: JSON.stringify(body) }
      } catch {
        // If parsing fails, continue with original body
      }
    }

    return globalThis.fetch(input, {
      ...modifiedInit,
      headers,
    })
  }

  // Pass empty apiKey like opencode does - this prevents the SDK from adding x-api-key header
  // The custom fetch will add the Bearer token instead
  const anthropic = createAnthropic({
    apiKey: '',
    fetch: customFetch as unknown as typeof globalThis.fetch,
  })

  // Cast to LanguageModel since the AI SDK types may be slightly different versions
  // Using unknown as intermediate to handle V2 vs V3 differences
  return anthropic(anthropicModelId) as unknown as LanguageModel
}

/**
 * Create a model that routes through the Codebuff backend.
 * This is the existing behavior - requests go to Codebuff backend which forwards to OpenRouter.
 */
function createCodebuffBackendModel(
  apiKey: string,
  model: string,
): LanguageModel {
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
      new URL(path.join('/api/v1', endpoint), WEBSITE_URL).toString(),
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codebuff`,
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
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
}
