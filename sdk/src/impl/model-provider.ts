/**
 * Model provider abstraction for Openbuff local/BYOK routing.
 *
 * This module handles:
 * - OpenAI-compatible providers configured in openbuff.json
 * - Optional ChatGPT/Codex OAuth direct requests for allowlisted OpenAI models
 *
 * Openbuff intentionally has no Codebuff hosted inference fallback.
 */

import { isFreeMode } from '@codebuff/common/constants/free-agents'
import {
  CHATGPT_BACKEND_BASE_URL,
  CHATGPT_OAUTH_ENABLED,
  isChatGptOAuthModelAllowed,
  isOpenAIProviderModel,
  toOpenAIModelId,
} from '@codebuff/common/constants/chatgpt-oauth'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@codebuff/internal/openai-compatible/index'

import { getValidChatGptOAuthCredentials } from '../credentials'
import {
  DEFAULT_PROVIDER_COMPATIBILITY,
  loadProviderConfigSync,
  resolveConfiguredAgentModelConfig,
  resolveConfiguredProviderModel,
} from '../provider-config'
import {
  createChatGptBackendFetch,
  extractChatGptAccountId,
} from './chatgpt-backend-fetch'

import type {
  OpenbuffReasoningEffort,
  ProviderCompatibility,
  ResolvedProviderModel,
} from '../provider-config'
import type { FetchFunction } from '@ai-sdk/provider-utils'
import type { LanguageModel } from 'ai'

// ============================================================================
// ChatGPT OAuth Rate Limit Cache
// ============================================================================

/** Timestamp (ms) when ChatGPT OAuth rate limit expires, or null if not rate-limited */
let chatGptOAuthRateLimitedUntil: number | null = null

/**
 * Mark ChatGPT OAuth as rate-limited. Subsequent requests will skip direct ChatGPT OAuth
 * until the reset time.
 */
export function markChatGptOAuthRateLimited(resetAt?: Date): void {
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
  chatGptOAuthRateLimitedUntil = resetAt
    ? resetAt.getTime()
    : fiveMinutesFromNow
}

/**
 * Check if ChatGPT OAuth is currently rate-limited.
 */
export function isChatGptOAuthRateLimited(): boolean {
  if (chatGptOAuthRateLimitedUntil === null) {
    return false
  }
  if (Date.now() >= chatGptOAuthRateLimitedUntil) {
    chatGptOAuthRateLimitedUntil = null
    return false
  }
  return true
}

/**
 * Reset the ChatGPT OAuth rate-limit cache.
 * Call this when user reconnects their ChatGPT subscription.
 */
export function resetChatGptOAuthRateLimit(): void {
  chatGptOAuthRateLimitedUntil = null
}

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Historical Codebuff API key slot. Openbuff local provider routing does not require it. */
  apiKey: string
  /** Model ID requested by an agent. Can be remapped by openbuff.json. */
  model: string
  /** Agent ID requesting this model. Used for per-agent model overrides. */
  agentId?: string
  /** If true, skip ChatGPT OAuth. */
  skipChatGptOAuth?: boolean
  /** Cost mode (e.g. 'free') — affects ChatGPT OAuth error wording. */
  costMode?: string
  /** Deprecated; Openbuff always avoids hosted Codebuff inference. */
  localMode?: boolean
}

/**
 * Result from getModelForRequest.
 */
export interface ModelResult {
  /** The language model to use for requests */
  model: LanguageModel
  /** Whether this model uses ChatGPT OAuth direct (affects cost tracking) */
  isChatGptOAuth: boolean
  /** Compatibility behavior requested by the provider config. */
  compatibility: ProviderCompatibility
  /** Optional reasoning effort selected by openbuff.json routing. */
  reasoningEffort?: OpenbuffReasoningEffort
}

/**
 * Get the appropriate model for a request.
 *
 * Resolves the requested agent model through openbuff.json, then routes to a
 * matching OpenAI-compatible provider. If configured, ChatGPT OAuth can still
 * serve allowlisted OpenAI models directly. There is no Codebuff backend
 * inference fallback in Openbuff.
 *
 * This function is async because it may need to refresh the OAuth token.
 */
export async function getModelForRequest(
  params: ModelRequestParams,
): Promise<ModelResult> {
  const { model, agentId, skipChatGptOAuth, costMode } = params
  const loadedProviderConfig = loadProviderConfigSync()
  const effectiveAgentModelConfig = resolveConfiguredAgentModelConfig({
    agentId,
    model,
    loadedConfig: loadedProviderConfig,
  })
  const effectiveModel = effectiveAgentModelConfig.model

  const configuredProviderModel = resolveConfiguredProviderModel({
    model: effectiveModel,
    loadedConfig: loadedProviderConfig,
  })
  if (configuredProviderModel) {
    if (configuredProviderModel.provider.type === 'chatgpt-oauth') {
      const chatGptOAuthCredentials = await getValidChatGptOAuthCredentials()
      if (!chatGptOAuthCredentials) {
        throw new Error(
          `ChatGPT/Codex OAuth credentials unavailable for provider '${configuredProviderModel.providerId}'. Please reconnect with /connect.`,
        )
      }

      return {
        model: createOpenAIOAuthModel(
          configuredProviderModel.providerModel,
          chatGptOAuthCredentials.accessToken,
        ),
        isChatGptOAuth: true,
        compatibility: configuredProviderModel.compatibility,
        reasoningEffort: effectiveAgentModelConfig.reasoningEffort,
      }
    }

    return {
      model: createConfiguredOpenAICompatibleModel(configuredProviderModel),
      isChatGptOAuth: false,
      compatibility: configuredProviderModel.compatibility,
      reasoningEffort: effectiveAgentModelConfig.reasoningEffort,
    }
  }

  // Check if we should use ChatGPT OAuth direct.
  // Only attempt for allowlisted models.
  if (
    CHATGPT_OAUTH_ENABLED &&
    !skipChatGptOAuth &&
    isOpenAIProviderModel(effectiveModel) &&
    isChatGptOAuthModelAllowed(effectiveModel)
  ) {
    if (isChatGptOAuthRateLimited()) {
      if (isFreeMode(costMode)) {
        throw new Error(
          'ChatGPT rate limit reached. Please wait a few minutes and try again.',
        )
      }
    } else {
      const chatGptOAuthCredentials = await getValidChatGptOAuthCredentials()

      if (chatGptOAuthCredentials) {
        return {
          model: createOpenAIOAuthModel(
            effectiveModel,
            chatGptOAuthCredentials.accessToken,
          ),
          isChatGptOAuth: true,
          compatibility: {
            ...DEFAULT_PROVIDER_COMPATIBILITY,
            stripProviderMetadata: true,
            supportsRequiredToolChoice: true,
          },
          reasoningEffort: effectiveAgentModelConfig.reasoningEffort,
        }
      }

      if (isFreeMode(costMode)) {
        throw new Error(
          'ChatGPT OAuth credentials unavailable. Please reconnect with /connect:chatgpt.',
        )
      }
    }
  }

  throw new Error(
    `Openbuff could not route model '${effectiveModel}'${
      agentId ? ` for agent '${agentId}'` : ''
    }. Add a provider mapping in openbuff.json or set OPENBUFF_PROVIDER_CONFIG.`,
  )
}

function createConfiguredOpenAICompatibleModel(
  resolvedModel: ResolvedProviderModel,
): LanguageModel {
  const { providerId, provider, providerModel, apiKey } = resolvedModel
  if (provider.type !== 'openai-compatible') {
    throw new Error(
      `Provider '${providerId}' is not an OpenAI-compatible provider.`,
    )
  }
  const baseURL = provider.baseURL.replace(/\/$/, '')

  return new OpenAICompatibleChatLanguageModel(providerModel, {
    provider: providerId,
    url: ({ path: endpoint }: { path: string }) => `${baseURL}${endpoint}`,
    headers: () => ({
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/openbuff-custom-provider`,
    }),
    fetch: createConfiguredProviderFetch(resolvedModel),
    includeUsage: undefined,
    supportsStructuredOutputs: provider.supportsStructuredOutputs,
    stringifyTextContent: resolvedModel.compatibility.stringifyTextContent,
  })
}

function shouldDisableThinkingForProviderModel(providerModel: string): boolean {
  return /(^|[-_/])deepseek([-_/]|$)/i.test(providerModel)
}

function shouldDowngradeRequiredToolChoiceForProviderModel(
  resolvedModel: Pick<ResolvedProviderModel, 'providerModel'> & {
    compatibility?: Partial<ProviderCompatibility>
  },
): boolean {
  if (resolvedModel.compatibility?.supportsRequiredToolChoice === false) {
    return true
  }

  // Some OpenAI-compatible coding providers accept tool schemas but hang or
  // reject when tool_choice is forced to "required". The proposal prompt still
  // strongly asks for propose_* tool calls; omitting the forced choice lets
  // these models complete normally.
  return /(^|[-_/])(deepseek|glm)([-_/]|$)/i.test(
    resolvedModel.providerModel,
  )
}

function shouldTransformRequestForProviderModel(
  resolvedModel: Pick<ResolvedProviderModel, 'providerModel'> & {
    compatibility?: Partial<ProviderCompatibility>
  },
): boolean {
  return (
    shouldDisableThinkingForProviderModel(resolvedModel.providerModel) ||
    shouldDowngradeRequiredToolChoiceForProviderModel(resolvedModel)
  )
}

export function applyConfiguredProviderRequestCompatibility(
  body: Record<string, unknown>,
  resolvedModel: Pick<ResolvedProviderModel, 'providerModel'> & {
    compatibility?: Partial<ProviderCompatibility>
  },
): Record<string, unknown> {
  if (!shouldTransformRequestForProviderModel(resolvedModel)) {
    return body
  }

  const shouldDisableThinking = shouldDisableThinkingForProviderModel(
    resolvedModel.providerModel,
  )
  const shouldDowngradeRequiredToolChoice =
    shouldDowngradeRequiredToolChoiceForProviderModel(resolvedModel) &&
    body.tool_choice === 'required'

  return {
    ...body,
    ...(shouldDisableThinking
      ? {
          thinking: { type: 'disabled' },
          reasoning_effort: undefined,
        }
      : {}),
    ...(shouldDowngradeRequiredToolChoice
      ? {
          tool_choice: undefined,
        }
      : {}),
  }
}

function createConfiguredProviderFetch(
  resolvedModel: ResolvedProviderModel,
): FetchFunction | undefined {
  if (!shouldTransformRequestForProviderModel(resolvedModel)) {
    return undefined
  }

  const fetchFn = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let transformedInit = init

    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>
        transformedInit = {
          ...init,
          body: JSON.stringify(
            applyConfiguredProviderRequestCompatibility(body, resolvedModel),
          ),
        }
      } catch {
        // If the body is not JSON, pass it through unchanged.
      }
    }

    return globalThis.fetch(input, transformedInit)
  }

  return fetchFn as FetchFunction
}

/**
 * Create an OpenAI model that routes through the ChatGPT backend API (Codex endpoint).
 * Uses a custom fetch that transforms between Chat Completions and Responses API formats.
 */
function createOpenAIOAuthModel(
  model: string,
  oauthToken: string,
): LanguageModel {
  const openAIModelId = toOpenAIModelId(model)
  const accountId = extractChatGptAccountId(oauthToken)

  return new OpenAICompatibleChatLanguageModel(openAIModelId, {
    provider: 'openai',
    url: () => `${CHATGPT_BACKEND_BASE_URL}/codex/responses`,
    headers: () => ({
      Authorization: `Bearer ${oauthToken}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      accept: 'text/event-stream',
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/openbuff-chatgpt-oauth`,
      ...(accountId ? { 'chatgpt-account-id': accountId } : {}),
    }),
    fetch: createChatGptBackendFetch(),
    supportsStructuredOutputs: true,
    stringifyTextContent: true,
    includeUsage: undefined,
  })
}
