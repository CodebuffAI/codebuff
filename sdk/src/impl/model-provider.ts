/**
 * Model provider abstraction for Openbuff local/BYOK routing.
 *
 * This module handles:
 * - OpenAI-compatible providers configured in openbuff.json
 * - Anthropic-compatible providers (native Messages API: api.anthropic.com or
 *   any gateway speaking the same protocol, e.g. https://cc.freemodel.dev)
 * - Optional ChatGPT/Codex OAuth direct requests for allowlisted OpenAI models
 *
 * Openbuff intentionally has no Codebuff hosted inference fallback.
 */

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
import { createAnthropic } from '@ai-sdk/anthropic'

import { getValidChatGptOAuthCredentials } from '../credentials'
import {
  DEFAULT_PROVIDER_COMPATIBILITY,
  loadProviderConfigSync,
  resolveConfiguredAgentModelConfig,
  resolveConfiguredProviderModel,
  resolveModelCapabilities,
} from '../provider-config'
import type { ModelPricing } from './llm'
import {
  createChatGptBackendFetch,
  extractChatGptAccountId,
} from './chatgpt-backend-fetch'

import type {
  OpenbuffReasoningEffort,
  LoadedProviderConfig,
  ProviderCompatibility,
  ResolvedProviderModel,
} from '../provider-config'
import type { FetchFunction } from '@ai-sdk/provider-utils'
import type { LanguageModel } from 'ai'

// ============================================================================
// ChatGPT OAuth Rate Limit Cache
// ============================================================================

/**
 * ChatGPT OAuth rate-limit cache.
 *
 * Encapsulated in a closure factory so the timestamp is only mutable through
 * the three exported accessors, not via a module-level `let`. This removes the
 * concurrent-run race where a stray import could read or overwrite the raw
 * `let` binding.
 */
function createChatGptOAuthRateLimitCache(): {
  mark: (resetAt?: Date) => void
  isLimited: () => boolean
  reset: () => void
} {
  /** Timestamp (ms) when rate limit expires, or null if not rate-limited */
  let rateLimitedUntil: number | null = null
  return {
    mark(resetAt?: Date): void {
      const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000
      rateLimitedUntil = resetAt ? resetAt.getTime() : fiveMinutesFromNow
    },
    isLimited(): boolean {
      if (rateLimitedUntil === null) {
        return false
      }
      if (Date.now() >= rateLimitedUntil) {
        rateLimitedUntil = null
        return false
      }
      return true
    },
    reset(): void {
      rateLimitedUntil = null
    },
  }
}

const chatGptOAuthRateLimit = createChatGptOAuthRateLimitCache()

/**
 * Mark ChatGPT OAuth as rate-limited. Subsequent requests will skip direct ChatGPT OAuth
 * until the reset time.
 */
export function markChatGptOAuthRateLimited(resetAt?: Date): void {
  chatGptOAuthRateLimit.mark(resetAt)
}

/**
 * Check if ChatGPT OAuth is currently rate-limited.
 */
export function isChatGptOAuthRateLimited(): boolean {
  return chatGptOAuthRateLimit.isLimited()
}

/**
 * Reset the ChatGPT OAuth rate-limit cache.
 * Call this when user reconnects their ChatGPT subscription.
 */
export function resetChatGptOAuthRateLimit(): void {
  chatGptOAuthRateLimit.reset()
}

/**
 * Parameters for requesting a model.
 */
export interface ModelRequestParams {
  /** Historical Codebuff API key slot. Openbuff local provider routing does not require it. */
  apiKey: string
  /** Model ID requested by an agent. Can be remapped by openbuff.json. If omitted, resolved entirely from openbuff.json. */
  model?: string
  /** Agent ID requesting this model. Used for per-agent model overrides. */
  agentId?: string
  /** If true, skip ChatGPT OAuth. */
  skipChatGptOAuth?: boolean
  /** Routing cost mode ('lite' | 'normal' | 'max' | …). Accepted for caller
   *  compatibility; does not affect BYOK provider resolution. */
  costMode?: string
  /** True when the prompt/message history contains image input parts. */
  requiresVision?: boolean
  /** When true, an explicit `model` wins over mode/agent/defaultModel routing
   *  in openbuff.json. Used by the provider-failover loop so each configured
   *  failover model is actually attempted instead of being re-resolved to the
   *  same primary model (M8.1). */
  preferModelParam?: boolean
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
  /** The resolved effective model string after openbuff.json routing (e.g. for provider-options computation). */
  effectiveModel: string
  /** Context window in tokens for the resolved configured model, when known from provider metadata. */
  contextWindowTokens?: number
  /** Configured per-million-token pricing for the resolved model, from
   *  openbuff.json `modelCapabilities.pricing`. Used by the cost-accounting
   *  fallback when the provider does not return OpenRouter-style cost metadata. */
  pricing?: ModelPricing
}

export function selectAdaptiveReasoningEffort(params: {
  agentId?: string
  supported?: boolean
  efforts?: OpenbuffReasoningEffort[]
}): OpenbuffReasoningEffort | undefined {
  if (params.supported === false) return undefined
  const id = (params.agentId ?? '').toLowerCase()
  const preferred: OpenbuffReasoningEffort =
    /thinker|debugger|reviewer|plan|base-deep|architect|integration-agent|performance-specialist|incident-coordinator|release-manager|docs-architect|evaluator/.test(id)
      ? 'high'
      : /editor|test-writer|general-agent|base2|base$/.test(id)
        ? 'medium'
        : /file-picker|code-searcher|context-pruner|researcher|synthesizer/.test(
              id,
            )
          ? 'low'
          : 'medium'
  const efforts = params.efforts
  if (!efforts?.length) return params.supported ? preferred : undefined
  if (efforts.includes(preferred)) return preferred
  const order: OpenbuffReasoningEffort[] = [
    'high',
    'medium',
    'low',
    'minimal',
    'none',
  ]
  return order.find((effort) => efforts.includes(effort))
}

/**
 * Get the appropriate model for a request.
 *
 * Resolves the requested agent model through openbuff.json, then routes to a
 * matching OpenAI-compatible or Anthropic-compatible provider. If configured,
 * ChatGPT OAuth can still serve allowlisted OpenAI models directly. There is no Codebuff backend
 * inference fallback in Openbuff.
 *
 * This function is async because it may need to refresh the OAuth token.
 */
export async function getModelForRequest(
  params: ModelRequestParams,
): Promise<ModelResult> {
  const { model, agentId, skipChatGptOAuth, preferModelParam } = params
  const loadedProviderConfig = loadProviderConfigSync()
  const effectiveAgentModelConfig = resolveConfiguredAgentModelConfig({
    agentId,
    model,
    loadedConfig: loadedProviderConfig,
    preferModelParam,
  })
  let effectiveModel = effectiveAgentModelConfig.model
  let reasoningEffort = effectiveAgentModelConfig.reasoningEffort

  let configuredProviderModel = resolveConfiguredProviderModel({
    model: effectiveModel,
    loadedConfig: loadedProviderConfig,
  })
  if (params.requiresVision && configuredProviderModel) {
    const visionRoute = resolveVisionModelIfNeeded({
      configuredProviderModel,
      effectiveModel,
      loadedConfig: loadedProviderConfig,
      reasoningEffort,
    })
    effectiveModel = visionRoute.effectiveModel
    reasoningEffort = visionRoute.reasoningEffort
    configuredProviderModel = visionRoute.configuredProviderModel
  }
  const resolvedCapabilities = configuredProviderModel
    ? resolveModelCapabilities({
        providerId: configuredProviderModel.providerId,
        model: effectiveModel,
        loadedConfig: loadedProviderConfig,
      })
    : undefined
  if (
    reasoningEffort === undefined &&
    loadedProviderConfig.config.adaptiveReasoning !== false
  ) {
    reasoningEffort = selectAdaptiveReasoningEffort({
      agentId,
      supported: resolvedCapabilities?.reasoning?.supported,
      efforts: resolvedCapabilities?.reasoning?.efforts,
    })
  }
  const contextWindowTokens = resolvedCapabilities?.context?.windowTokens
  const pricing = resolvedCapabilities?.pricing

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
        reasoningEffort,
        effectiveModel,
        contextWindowTokens,
        pricing,
      }
    }

    if (configuredProviderModel.provider.type === 'anthropic-compatible') {
      return {
        model: createConfiguredAnthropicModel(configuredProviderModel),
        isChatGptOAuth: false,
        compatibility: configuredProviderModel.compatibility,
        reasoningEffort,
        effectiveModel,
        contextWindowTokens,
        pricing,
      }
    }

    const isProposalAgent = Boolean(
      agentId && /^editor-implementor-proposal-\d+$/.test(agentId),
    )

    return {
      model: createConfiguredOpenAICompatibleModel({
        ...configuredProviderModel,
        isProposalAgent,
      }),
      isChatGptOAuth: false,
      compatibility: configuredProviderModel.compatibility,
      reasoningEffort,
      effectiveModel,
      contextWindowTokens,
      pricing,
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
      throw new Error(
        'ChatGPT rate limit reached. Please wait a few minutes and try again.',
      )
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
          reasoningEffort,
          effectiveModel,
          contextWindowTokens,
        }
      }

      throw new Error(
        'ChatGPT OAuth credentials unavailable. Please reconnect with /connect:chatgpt.',
      )
    }
  }

  throw new Error(
    `Openbuff could not route model '${effectiveModel}'${
      agentId ? ` for agent '${agentId}'` : ''
    }. Add a provider mapping in openbuff.json or set OPENBUFF_PROVIDER_CONFIG.`,
  )
}

/**
 * Resolve model capacity without constructing a provider client or touching
 * credentials. The runtime uses this before the first LLM request so pruning
 * and context-window telemetry share the same BYOK capability source as the
 * request path.
 */
export function resolveModelContextWindow(params: {
  agentId?: string
  model?: string
}): number | undefined {
  const loadedConfig = loadProviderConfigSync()
  const effectiveModel = resolveConfiguredAgentModelConfig({
    agentId: params.agentId,
    model: params.model,
    loadedConfig,
  }).model
  const configured = resolveConfiguredProviderModel({
    model: effectiveModel,
    loadedConfig,
  })
  if (!configured) return undefined
  return resolveModelCapabilities({
    providerId: configured.providerId,
    model: effectiveModel,
    loadedConfig,
  })?.context?.windowTokens
}

type VisionSupport = 'yes' | 'no' | 'unknown'

function isLikelyVisionModelName(modelNames: string): boolean {
  return /(^|[-_/])(claude|gemini|gpt-4o|gpt-5|vision)([-_/.:]|$)/i.test(
    modelNames,
  )
}

function isLikelyNonVisionModelName(modelNames: string): boolean {
  return /(^|[-_/])(deepseek|qwen|kimi|minimax|glm|llama|mistral)([-_/.:]|$)/i.test(
    modelNames,
  )
}

function getModelVisionSupport(params: {
  configuredProviderModel: ResolvedProviderModel
  effectiveModel: string
  loadedConfig: LoadedProviderConfig
}): VisionSupport {
  const { configuredProviderModel, effectiveModel, loadedConfig } = params
  const capabilities = resolveModelCapabilities({
    providerId: configuredProviderModel.providerId,
    model: effectiveModel,
    loadedConfig,
  })

  if (capabilities.input?.image === true) return 'yes'
  if (capabilities.input?.image === false) return 'no'
  if (configuredProviderModel.provider.type === 'anthropic-compatible') {
    return 'yes'
  }

  const modelNames = [
    effectiveModel,
    configuredProviderModel.requestedModel,
    configuredProviderModel.providerModel,
  ].join(' ')
  if (isLikelyVisionModelName(modelNames)) {
    return 'yes'
  }
  if (isLikelyNonVisionModelName(modelNames)) {
    return 'no'
  }
  return 'unknown'
}

function getProviderRoutableModels(
  providerId: string,
  provider: ResolvedProviderModel['provider'],
): string[] {
  if (Array.isArray(provider.models)) {
    return provider.models.map((model) => `${providerId}/${model}`)
  }

  return Object.keys(provider.models).map((model) =>
    model.startsWith(`${providerId}/`) ? model : `${providerId}/${model}`,
  )
}

function getVisionFallbackRank(model: string): number {
  if (/opus/i.test(model)) return 0
  if (/sonnet/i.test(model)) return 1
  if (/gpt-5/i.test(model)) return 2
  if (/gpt-4o/i.test(model)) return 3
  if (/gemini/i.test(model)) return 4
  if (/claude/i.test(model)) return 5
  return 10
}

function findProviderVisionFallback(params: {
  configuredProviderModel: ResolvedProviderModel
  loadedConfig: LoadedProviderConfig
}): string | undefined {
  const { configuredProviderModel, loadedConfig } = params
  // Search the currently-configured provider first (intra-provider fallback)
  // so we prefer same-provider models before crossing providers.
  const candidateProviderIds = [
    configuredProviderModel.providerId,
    ...Object.keys(loadedConfig.config.providers).filter(
      (id) => id !== configuredProviderModel.providerId,
    ),
  ]

  const candidates: { model: string; support: VisionSupport }[] = []
  for (const providerId of candidateProviderIds) {
    const provider = loadedConfig.config.providers[providerId]
    if (!provider) continue
    const providerModels = getProviderRoutableModels(providerId, provider)
    for (const candidate of providerModels) {
      const candidateProviderModel = resolveConfiguredProviderModel({
        model: candidate,
        loadedConfig,
      })
      if (!candidateProviderModel) continue
      const support = getModelVisionSupport({
        configuredProviderModel: candidateProviderModel,
        effectiveModel: candidate,
        loadedConfig,
      })
      if (support === 'yes') {
        candidates.push({ model: candidate, support })
      }
    }
  }

  return candidates.sort(
    (left, right) =>
      getVisionFallbackRank(left.model) - getVisionFallbackRank(right.model),
  )[0]?.model
}

function resolveVisionModelIfNeeded(params: {
  configuredProviderModel: ResolvedProviderModel
  effectiveModel: string
  loadedConfig: LoadedProviderConfig
  reasoningEffort?: OpenbuffReasoningEffort
}): {
  configuredProviderModel: ResolvedProviderModel
  effectiveModel: string
  reasoningEffort?: OpenbuffReasoningEffort
} {
  const { configuredProviderModel, effectiveModel, loadedConfig } = params
  const visionSupport = getModelVisionSupport({
    configuredProviderModel,
    effectiveModel,
    loadedConfig,
  })
  if (visionSupport === 'yes') {
    return params
  }

  const visionModel =
    loadedConfig.config.visionModel ??
    findProviderVisionFallback({
      configuredProviderModel,
      loadedConfig,
    })
  if (!visionModel) {
    throw new Error(
      `Model '${effectiveModel}' ${
        visionSupport === 'no'
          ? 'is not image-capable'
          : 'is not annotated as image-capable'
      }, but this request contains image input. Configure visionModel in openbuff.json or route this agent to an image-capable model.`,
    )
  }

  const visionProviderModel = resolveConfiguredProviderModel({
    model: visionModel,
    loadedConfig,
  })
  if (!visionProviderModel) {
    throw new Error(
      `Configured visionModel '${visionModel}' could not be routed to a provider. Add it to openbuff.json providers before sending image input.`,
    )
  }

  const fallbackVisionSupport = getModelVisionSupport({
    configuredProviderModel: visionProviderModel,
    effectiveModel: visionModel,
    loadedConfig,
  })
  if (fallbackVisionSupport === 'no') {
    throw new Error(
      `Configured visionModel '${visionModel}' is marked non-vision, but this request contains image input. Choose an image-capable model.`,
    )
  }

  return {
    configuredProviderModel: visionProviderModel,
    effectiveModel: visionModel,
    reasoningEffort:
      loadedConfig.config.visionReasoningEffort ?? params.reasoningEffort,
  }
}

function createConfiguredOpenAICompatibleModel(
  resolvedModel: ResolvedProviderModel & { isProposalAgent?: boolean },
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
    headers: () => {
      const isAgentRouter = baseURL.includes('agentrouter.org')
      if (isAgentRouter) {
        const osMap: Record<string, string> = {
          darwin: 'macOS',
          linux: 'Linux',
          win32: 'Windows',
        }
        const rawPlatform =
          typeof process !== 'undefined' ? process.platform : 'linux'
        const os =
          osMap[rawPlatform] ||
          rawPlatform.charAt(0).toUpperCase() + rawPlatform.slice(1)
        const arch = typeof process !== 'undefined' ? process.arch : 'x64'
        const runtimeVersion =
          typeof process !== 'undefined' ? process.version : 'v24.3.0'

        return {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'user-agent': `factory-cli/0.130.0 (openbuff/${VERSION})`,
          'x-stainless-arch': arch,
          'x-stainless-lang': 'js',
          'x-stainless-os': os,
          'x-stainless-package-version': '6.25.0',
          'x-stainless-retry-count': '0',
          'x-stainless-runtime': 'node',
          'x-stainless-runtime-version': runtimeVersion,
        }
      }
      return {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        'user-agent': `ai-sdk/openai-compatible/${VERSION}/openbuff-custom-provider`,
      }
    },
    fetch: createConfiguredProviderFetch(resolvedModel),
    includeUsage: undefined,
    supportsStructuredOutputs: provider.supportsStructuredOutputs,
    stringifyTextContent: resolvedModel.compatibility.stringifyTextContent,
  })
}

/**
 * Normalize an Anthropic baseURL to the path the AI SDK expects.
 *
 * The AI SDK posts to `<baseURL>/messages`, while the Claude Code convention
 * (ANTHROPIC_BASE_URL) treats a bare host as the root and posts to
 * `<host>/v1/messages`. So when the configured URL has no version path
 * (e.g. https://cc.freemodel.dev), append `/v1`. If it already carries a path
 * segment (e.g. .../v1, .../anthropic/v1), leave it untouched.
 */
export function normalizeAnthropicBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '')
  const url = new URL(trimmed)
  const hasPathSegment = url.pathname !== '' && url.pathname !== '/'
  return hasPathSegment ? trimmed : `${trimmed}/v1`
}

function createConfiguredAnthropicModel(
  resolvedModel: ResolvedProviderModel,
): LanguageModel {
  const { providerId, provider, providerModel, apiKey } = resolvedModel
  if (provider.type !== 'anthropic-compatible') {
    throw new Error(
      `Provider '${providerId}' is not an Anthropic-compatible provider.`,
    )
  }

  const anthropic = createAnthropic({
    baseURL: normalizeAnthropicBaseURL(provider.baseURL),
    // Sent as the `x-api-key` header. Pass an empty string rather than letting
    // the SDK fall back to ANTHROPIC_API_KEY when no key is configured for a
    // local gateway.
    apiKey: apiKey ?? '',
    headers: {
      'user-agent': `ai-sdk/anthropic/${VERSION}/openbuff-custom-provider`,
    },
    name: providerId,
  })

  return anthropic(providerModel)
}

function shouldDisableThinkingForProviderModel(providerModel: string): boolean {
  return /(^|[-_/])deepseek([-_/]|$)/i.test(providerModel)
}

function shouldDowngradeRequiredToolChoiceForProviderModel(
  resolvedModel: Pick<ResolvedProviderModel, 'providerModel'> & {
    compatibility?: Partial<ProviderCompatibility>
    isProposalAgent?: boolean
  },
): boolean {
  if (resolvedModel.compatibility?.supportsRequiredToolChoice === false) {
    return true
  }

  // Never downgrade for proposal agents — they NEED tool_choice: required.
  // Without it, they return empty proposals and break the whole pipeline.
  if (resolvedModel.isProposalAgent) {
    return false
  }

  // Some OpenAI-compatible coding providers accept tool schemas but hang or
  // reject when tool_choice is forced to "required". The proposal prompt still
  // strongly asks for propose_* tool calls; omitting the forced choice lets
  // these models complete normally.
  return /(^|[-_/])(deepseek|glm)([-_/]|$)/i.test(resolvedModel.providerModel)
}

function shouldStripStopSequencesForProviderModel(
  resolvedModel: Pick<ResolvedProviderModel, 'providerModel'> & {
    compatibility?: Partial<ProviderCompatibility>
  },
): boolean {
  return resolvedModel.compatibility?.supportsStopSequences === false
}

function shouldTransformRequestForProviderModel(
  resolvedModel: Pick<ResolvedProviderModel, 'providerModel'> & {
    compatibility?: Partial<ProviderCompatibility>
    isProposalAgent?: boolean
  },
): boolean {
  return (
    shouldDisableThinkingForProviderModel(resolvedModel.providerModel) ||
    shouldDowngradeRequiredToolChoiceForProviderModel(resolvedModel) ||
    shouldStripStopSequencesForProviderModel(resolvedModel)
  )
}

export function applyConfiguredProviderRequestCompatibility(
  body: Record<string, unknown>,
  resolvedModel: Pick<ResolvedProviderModel, 'providerModel'> & {
    compatibility?: Partial<ProviderCompatibility>
    isProposalAgent?: boolean
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
  const shouldStripStopSequences =
    shouldStripStopSequencesForProviderModel(resolvedModel) && 'stop' in body

  const transformed: Record<string, unknown> = {
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

  if (shouldStripStopSequences) {
    delete transformed.stop
  }

  return transformed
}

function createConfiguredProviderFetch(
  resolvedModel: ResolvedProviderModel & { isProposalAgent?: boolean },
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
