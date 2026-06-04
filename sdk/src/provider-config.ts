import fs from 'fs'
import os from 'os'
import path from 'path'

import { z } from 'zod/v4'

import { CHATGPT_OAUTH_OPENAI_MODEL_ALLOWLIST } from '@codebuff/common/constants/chatgpt-oauth'

import { getConfigDir } from './credentials'
import { getSystemProcessEnv } from './env'

export const PROVIDER_CONFIG_ENV_VAR = 'OPENBUFF_PROVIDER_CONFIG'
export const LEGACY_PROVIDER_CONFIG_ENV_VAR = 'CODEBUFF_PROVIDER_CONFIG'
const PROVIDER_CONFIG_FILE_NAME = 'openbuff.json'
const LEGACY_PROVIDER_CONFIG_FILE_NAME = 'codebuff.json'
const GLOBAL_PROVIDER_CONFIG_FILE_NAME = 'provider-config.json'

const envVarNameSchema = z
  .string()
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    'apiKeyEnv must be an environment variable name like OPENAI_API_KEY',
  )

const modelMapSchema = z.record(z.string().min(1), z.string().min(1))
const positiveIntSchema = z.number().int().positive()
const nonNegativeNumberSchema = z.number().nonnegative()
const providerModeNames = ['default', 'lite', 'max', 'plan'] as const
type ProviderModeName = (typeof providerModeNames)[number]
export const reasoningEffortSchema = z.enum([
  'high',
  'medium',
  'low',
  'minimal',
  'none',
])
export type OpenbuffReasoningEffort = z.infer<typeof reasoningEffortSchema>
const optionalReasoningEffortSchema = reasoningEffortSchema
  .nullish()
  .transform((value) => value ?? undefined)

const routableModelValueSchema = z.union([
  z.string().min(1),
  z.object({
    model: z.string().min(1),
    reasoningEffort: reasoningEffortSchema.optional(),
  }),
])
const agentModelValueSchema = routableModelValueSchema
const modeModelSchema = z
  .object({
    default: routableModelValueSchema.optional(),
    lite: routableModelValueSchema.optional(),
    max: routableModelValueSchema.optional(),
    plan: routableModelValueSchema.optional(),
  })
  .default({})

const editorMultiPromptSchema = z
  .object({
    /** Models used by editor-multi-prompt proposal agents, in proposal order. */
    proposalModels: z.array(routableModelValueSchema).min(1).max(5).optional(),
    /** Optional reasoning efforts for proposal agents, in proposal order. */
    proposalReasoningEfforts: z
      .array(optionalReasoningEffortSchema)
      .max(5)
      .optional(),
    /** Model used by the best-of-N selector that chooses the winning diff. */
    selectorModel: routableModelValueSchema.optional(),
    /** Optional reasoning effort for the best-of-N selector. */
    selectorReasoningEffort: reasoningEffortSchema.optional(),
  })
  .optional()

export const DEFAULT_PROVIDER_COMPATIBILITY = {
  stripCacheControl: true,
  stringifyTextContent: true,
  supportsTools: true,
  supportsRequiredToolChoice: true,
  stripProviderMetadata: true,
} as const

const providerCompatibilitySchema = z
  .object({
    /** Remove prompt-cache provider metadata that strict OpenAI-compatible APIs reject. */
    stripCacheControl: z.boolean().default(true),
    /** Send text-only user content as a plain string instead of [{ type: "text" }]. */
    stringifyTextContent: z.boolean().default(true),
    /** If false, Openbuff omits tool definitions for this provider. */
    supportsTools: z.boolean().default(true),
    /** If false, Openbuff downgrades `tool_choice: "required"` to provider default tool choice. */
    supportsRequiredToolChoice: z.boolean().default(true),
    /** If true, Openbuff omits non-provider request metadata for this provider. */
    stripProviderMetadata: z.boolean().default(true),
  })
  .default(DEFAULT_PROVIDER_COMPATIBILITY)

export const providerDiscoverySchema = z.object({
  /** Discovery strategy. Auto-detected from baseURL if not specified. */
  strategy: z
    .enum(['openai-compatible', 'ollama', 'openrouter', 'custom'])
    .default('openai-compatible'),
  /** Custom discovery endpoint URL. Defaults to <baseURL>/models. */
  endpoint: z.string().url().optional(),
  /** JSON path to the models array in the response. Defaults vary by strategy ("data" for openai-compatible, "models" for ollama). */
  arrayPath: z.string().min(1).optional(),
  /** JSON path to the model id field within each model object. Defaults vary by strategy ("id" for openai-compatible, "name" for ollama). */
  idPath: z.string().min(1).optional(),
})

export type ProviderDiscovery = z.infer<typeof providerDiscoverySchema>
export type ProviderDiscoveryInput = z.input<typeof providerDiscoverySchema>

export const modelCapabilitiesSchema = z.object({
  context: z
    .object({
      windowTokens: positiveIntSchema.optional(),
      outputTokens: positiveIntSchema.optional(),
    })
    .optional(),
  reasoning: z
    .object({
      supported: z.boolean().optional(),
      efforts: z.array(reasoningEffortSchema).optional(),
      defaultEffort: reasoningEffortSchema.optional(),
    })
    .optional(),
  tools: z
    .object({
      supported: z.boolean().optional(),
      requiredToolChoice: z.boolean().optional(),
      structuredOutputs: z.boolean().optional(),
    })
    .optional(),
  promptCaching: z
    .object({
      supported: z.boolean().optional(),
      readTokens: z.boolean().optional(),
      writeTokens: z.boolean().optional(),
    })
    .optional(),
  pricing: z
    .object({
      inputPerMillionTokens: nonNegativeNumberSchema.optional(),
      outputPerMillionTokens: nonNegativeNumberSchema.optional(),
      cachedInputPerMillionTokens: nonNegativeNumberSchema.optional(),
      currency: z.string().min(1).default('USD'),
    })
    .optional(),
  quality: z
    .object({
      tier: z.enum(['economy', 'balanced', 'premium', 'frontier']).optional(),
      score: z.number().min(0).max(100).optional(),
      label: z.string().min(1).optional(),
    })
    .optional(),
})

const modelCapabilitiesByModelSchema = z.record(
  z.string().min(1),
  modelCapabilitiesSchema,
)

function isLocalHttpUrl(value: string): boolean {
  const url = new URL(value)
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  )
}

const openAICompatibleProviderSchema = z
  .object({
    type: z.literal('openai-compatible').default('openai-compatible'),
    baseURL: z
      .string()
      .url()
      .refine((value) => {
        const protocol = new URL(value).protocol
        return protocol === 'https:' || protocol === 'http:'
      }, 'baseURL must use http or https'),
    apiKeyEnv: envVarNameSchema.optional(),
    models: z.union([z.array(z.string().min(1)), modelMapSchema]),
    supportsStructuredOutputs: z.boolean().default(false),
    compatibility: providerCompatibilitySchema,
    /** Default context window in tokens for all models in this provider. */
    contextWindowTokens: positiveIntSchema.optional(),
    /** Per-model context window overrides (model id -> tokens). */
    modelContextWindowTokens: z
      .record(z.string().min(1), positiveIntSchema)
      .optional(),
    /** Provider-level default capability metadata. */
    defaultCapabilities: modelCapabilitiesSchema.optional(),
    /** Per-model capability metadata keyed by requested or provider model id. */
    modelCapabilities: modelCapabilitiesByModelSchema.optional(),
    /** Discovery settings for auto-fetching available models from the provider endpoint. */
    discovery: providerDiscoverySchema.optional(),
  })
  .refine(
    (provider) =>
      !provider.apiKeyEnv || new URL(provider.baseURL).protocol === 'https:',
    'Providers with apiKeyEnv must use https baseURL',
  )
  .refine(
    (provider) =>
      new URL(provider.baseURL).protocol !== 'http:' ||
      isLocalHttpUrl(provider.baseURL),
    'http baseURL is only allowed for local providers',
  )

const chatGptOAuthProviderSchema = z.object({
  type: z.literal('chatgpt-oauth'),
  models: z.union([z.array(z.string().min(1)), modelMapSchema]),
  compatibility: providerCompatibilitySchema,
  /** Default context window in tokens for all models in this provider. */
  contextWindowTokens: positiveIntSchema.optional(),
  /** Per-model context window overrides (model id -> tokens). */
  modelContextWindowTokens: z
    .record(z.string().min(1), positiveIntSchema)
    .optional(),
  /** Provider-level default capability metadata. */
  defaultCapabilities: modelCapabilitiesSchema.optional(),
  /** Per-model capability metadata keyed by requested or provider model id. */
  modelCapabilities: modelCapabilitiesByModelSchema.optional(),
  /** Discovery settings for auto-fetching available models (defaults to none). */
  discovery: providerDiscoverySchema.optional(),
})

const providerSchema = z.union([
  openAICompatibleProviderSchema,
  chatGptOAuthProviderSchema,
])

function routableModelValueToModel(
  value: z.infer<typeof routableModelValueSchema> | undefined,
): string | undefined {
  return typeof value === 'string' ? value : value?.model
}

function routableModelValueToReasoningEffort(
  value: z.infer<typeof routableModelValueSchema> | undefined,
): OpenbuffReasoningEffort | undefined {
  return typeof value === 'string' ? undefined : value?.reasoningEffort
}

export const providerConfigFileSchema = z
  .object({
    providers: z.record(z.string().min(1), providerSchema).optional(),
    provider: z.record(z.string().min(1), providerSchema).optional(),
    /** Model used for any agent without an explicit entry in `agents`. */
    defaultModel: routableModelValueSchema.optional(),
    /** Optional reasoning effort for the default fallback model. */
    defaultReasoningEffort: reasoningEffortSchema.optional(),
    /** Mode-level aliases for the built-in root agents. */
    modes: modeModelSchema,
    /** Optional reasoning efforts for built-in root modes. */
    modeReasoningEfforts: z
      .object({
        default: reasoningEffortSchema.optional(),
        lite: reasoningEffortSchema.optional(),
        max: reasoningEffortSchema.optional(),
        plan: reasoningEffortSchema.optional(),
      })
      .default({}),
    /** Per-agent requested model overrides. Keys are agent IDs; values are provider-resolvable model IDs. */
    agents: z.record(z.string().min(1), agentModelValueSchema).optional(),
    /** Optional per-agent reasoning efforts. Keys are agent IDs. */
    agentReasoningEfforts: z
      .record(z.string().min(1), reasoningEffortSchema)
      .optional(),
    /** Convenience routing for editor-multi-prompt best-of-N proposals. */
    editorMultiPrompt: editorMultiPromptSchema,
  })
  .transform((config) => {
    const agents: Record<string, string> = {}
    const explicitAgentReasoningEffortIds = new Set(
      Object.keys(config.agentReasoningEfforts ?? {}),
    )
    const agentReasoningEfforts: Record<string, OpenbuffReasoningEffort> = {
      ...(config.agentReasoningEfforts ?? {}),
    }
    for (const [agentId, value] of Object.entries(config.agents ?? {})) {
      agents[agentId] = routableModelValueToModel(value)!
      const effort = routableModelValueToReasoningEffort(value)
      if (effort) {
        agentReasoningEfforts[agentId] = effort
        explicitAgentReasoningEffortIds.add(agentId)
      }
    }
    const hasExplicitAgentRoute = (agentId: string) =>
      normalizeAgentIdCandidates(agentId).some(
        (candidate) => candidate in agents,
      )
    const hasExplicitAgentReasoningEffort = (agentId: string) =>
      normalizeAgentIdCandidates(agentId).some((candidate) =>
        explicitAgentReasoningEffortIds.has(candidate),
      )

    const modes: Partial<Record<ProviderModeName, string>> = {}
    for (const [mode, value] of Object.entries(config.modes ?? {})) {
      const configuredModel = routableModelValueToModel(value)
      if (configuredModel) {
        modes[mode as ProviderModeName] = configuredModel
      }
    }
    const modeReasoningEfforts: Record<string, OpenbuffReasoningEffort> = {
      ...(config.modeReasoningEfforts ?? {}),
    }
    for (const [mode, value] of Object.entries(config.modes ?? {})) {
      const effort = routableModelValueToReasoningEffort(value)
      if (effort) modeReasoningEfforts[mode] = effort
    }

    const configuredProposalModels =
      config.editorMultiPrompt?.proposalModels ?? []
    const proposalModels = configuredProposalModels.map(
      (value) => routableModelValueToModel(value)!,
    )
    const proposalReasoningEfforts = configuredProposalModels.map(
      (value, index) =>
        routableModelValueToReasoningEffort(value) ??
        config.editorMultiPrompt?.proposalReasoningEfforts?.[index],
    )
    const editorMultiPromptAgents: Record<string, string> = {}
    proposalModels.forEach((model, index) => {
      const agentId = `editor-implementor-proposal-${index + 1}`
      if (!hasExplicitAgentRoute(agentId)) {
        editorMultiPromptAgents[agentId] = model
      }
      const effort = proposalReasoningEfforts[index]
      if (
        effort &&
        !hasExplicitAgentRoute(agentId) &&
        !hasExplicitAgentReasoningEffort(agentId)
      ) {
        agentReasoningEfforts[agentId] = effort
      }
    })
    // editor-multi-prompt can receive more prompts than the user explicitly
    // configured. Without this, proposal #4/#5 silently fall back to the
    // built-in cloud model and can appear to hang in local Openbuff installs.
    const lastConfiguredProposalModel =
      proposalModels[proposalModels.length - 1]
    const lastConfiguredProposalEffort =
      proposalReasoningEfforts[proposalReasoningEfforts.length - 1]
    if (lastConfiguredProposalModel) {
      for (let index = proposalModels.length; index < 5; index++) {
        const agentId = `editor-implementor-proposal-${index + 1}`
        if (!hasExplicitAgentRoute(agentId)) {
          editorMultiPromptAgents[agentId] = lastConfiguredProposalModel
        }
        if (
          lastConfiguredProposalEffort &&
          !hasExplicitAgentRoute(agentId) &&
          !hasExplicitAgentReasoningEffort(agentId)
        ) {
          agentReasoningEfforts[agentId] = lastConfiguredProposalEffort
        }
      }
      if (!hasExplicitAgentRoute('editor-implementor-proposal-direct')) {
        editorMultiPromptAgents['editor-implementor-proposal-direct'] =
          lastConfiguredProposalModel
      }
      if (
        lastConfiguredProposalEffort &&
        !hasExplicitAgentRoute('editor-implementor-proposal-direct') &&
        !hasExplicitAgentReasoningEffort('editor-implementor-proposal-direct')
      ) {
        agentReasoningEfforts['editor-implementor-proposal-direct'] =
          lastConfiguredProposalEffort
      }
    }
    const configuredSelectorModel = routableModelValueToModel(
      config.editorMultiPrompt?.selectorModel,
    )
    // If a user routes best-of-N proposals to local/OpenAI-compatible models
    // but omits selectorModel, keep the whole feature on that accessible
    // provider instead of silently falling back to the built-in cloud selector.
    const selectorModel = configuredSelectorModel ?? lastConfiguredProposalModel
    const selectorReasoningEffort =
      routableModelValueToReasoningEffort(
        config.editorMultiPrompt?.selectorModel,
      ) ??
      config.editorMultiPrompt?.selectorReasoningEffort ??
      (configuredSelectorModel ? undefined : lastConfiguredProposalEffort)
    if (selectorModel && !hasExplicitAgentRoute('best-of-n-selector2')) {
      editorMultiPromptAgents['best-of-n-selector2'] = selectorModel
    }
    if (
      selectorReasoningEffort &&
      !hasExplicitAgentRoute('best-of-n-selector2') &&
      !hasExplicitAgentReasoningEffort('best-of-n-selector2')
    ) {
      agentReasoningEfforts['best-of-n-selector2'] = selectorReasoningEffort
    }

    const defaultModel = routableModelValueToModel(config.defaultModel)
    const defaultReasoningEffort =
      routableModelValueToReasoningEffort(config.defaultModel) ??
      config.defaultReasoningEffort

    return {
      providers: {
        ...(config.provider ?? {}),
        ...(config.providers ?? {}),
      },
      defaultModel,
      defaultReasoningEffort,
      modes,
      modeReasoningEfforts,
      agents: {
        ...editorMultiPromptAgents,
        ...agents,
      },
      agentReasoningEfforts,
      ...(config.editorMultiPrompt && {
        editorMultiPrompt: {
          ...config.editorMultiPrompt,
          proposalModels,
          proposalReasoningEfforts,
          selectorModel,
          selectorReasoningEffort,
        },
      }),
    }
  })

export type ProviderConfigFile = z.infer<typeof providerConfigFileSchema>
export type ProviderConfigFileInput = z.input<typeof providerConfigFileSchema>
export type ProviderCompatibility =
  ProviderConfigFile['providers'][string]['compatibility']
export type ProviderConfig = ProviderConfigFile['providers'][string]
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>
export type ModelCapabilitiesInput = z.input<typeof modelCapabilitiesSchema>
export type OpenAICompatibleProviderConfig = Extract<
  ProviderConfig,
  { type: 'openai-compatible' }
>
export type ChatGptOAuthProviderConfig = Extract<
  ProviderConfig,
  { type: 'chatgpt-oauth' }
>

export type ResolvedProviderModel = {
  providerId: string
  provider: ProviderConfig
  requestedModel: string
  providerModel: string
  apiKey: string | undefined
  compatibility: ProviderCompatibility
}

export type LoadedProviderConfig = {
  config: ProviderConfigFile
  sourceFilePaths: string[]
}

const emptyProviderConfig = (): ProviderConfigFile => ({
  providers: {},
  defaultModel: undefined,
  defaultReasoningEffort: undefined,
  modes: {},
  modeReasoningEfforts: {},
  agents: {},
  agentReasoningEfforts: {},
})

function readProviderConfigFile(configPath: string): ProviderConfigFile {
  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const parseResult = providerConfigFileSchema.safeParse(rawConfig)
  if (!parseResult.success) {
    throw new Error(
      `Invalid provider config at ${configPath}: ${parseResult.error.message}`,
    )
  }
  return parseResult.data
}

function mergeProviderConfigs(
  base: ProviderConfigFile,
  override: ProviderConfigFile,
): ProviderConfigFile {
  return {
    providers: {
      ...base.providers,
      ...override.providers,
    },
    defaultModel: override.defaultModel ?? base.defaultModel,
    defaultReasoningEffort:
      override.defaultReasoningEffort ?? base.defaultReasoningEffort,
    modes: {
      ...(base.modes ?? {}),
      ...(override.modes ?? {}),
    },
    modeReasoningEfforts: {
      ...(base.modeReasoningEfforts ?? {}),
      ...(override.modeReasoningEfforts ?? {}),
    },
    agents: {
      ...(base.agents ?? {}),
      ...(override.agents ?? {}),
    },
    agentReasoningEfforts: {
      ...(base.agentReasoningEfforts ?? {}),
      ...(override.agentReasoningEfforts ?? {}),
    },
    editorMultiPrompt: override.editorMultiPrompt ?? base.editorMultiPrompt,
  }
}

function getOpenbuffConfigDirs(): string[] {
  const legacyDir = getConfigDir()
  const suffixMatch = legacyDir.match(/manicode(.*)$/)
  const envSuffix = suffixMatch?.[1] ?? ''
  const baseDir = path.join(os.homedir(), '.config', 'openbuff')
  const envDir = path.join(os.homedir(), '.config', `openbuff${envSuffix}`)
  return Array.from(new Set([baseDir, envDir]))
}

function getDefaultProviderConfigPaths(): string[] {
  return [
    ...getOpenbuffConfigDirs().flatMap((configDir) => [
      path.join(configDir, GLOBAL_PROVIDER_CONFIG_FILE_NAME),
      path.join(configDir, PROVIDER_CONFIG_FILE_NAME),
    ]),
    path.join(getConfigDir(), GLOBAL_PROVIDER_CONFIG_FILE_NAME),
    path.join(getConfigDir(), LEGACY_PROVIDER_CONFIG_FILE_NAME),
    ...getAncestorProviderConfigPaths(process.cwd()),
  ]
}

function getAncestorProviderConfigPaths(startDir: string): string[] {
  const paths: string[] = []
  let currentDir = path.resolve(startDir)

  while (true) {
    paths.push(path.join(currentDir, PROVIDER_CONFIG_FILE_NAME))
    paths.push(path.join(currentDir, LEGACY_PROVIDER_CONFIG_FILE_NAME))

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return paths
    }
    currentDir = parentDir
  }
}

export function loadProviderConfigSync(
  params: { env?: NodeJS.ProcessEnv } = {},
): LoadedProviderConfig {
  const env = params.env ?? getSystemProcessEnv()
  const explicitConfigPath =
    env[PROVIDER_CONFIG_ENV_VAR] ?? env[LEGACY_PROVIDER_CONFIG_ENV_VAR]
  const configPaths = explicitConfigPath
    ? [explicitConfigPath]
    : getDefaultProviderConfigPaths()

  let config = emptyProviderConfig()
  const sourceFilePaths: string[] = []

  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) {
      continue
    }

    try {
      const parsedConfig = readProviderConfigFile(configPath)
      config = mergeProviderConfigs(config, parsedConfig)
      sourceFilePaths.push(configPath)
    } catch (error) {
      if (explicitConfigPath) {
        throw error
      }
    }
  }

  return { config, sourceFilePaths }
}

function getModelMapping(
  providerId: string,
  requestedModel: string,
  provider: ProviderConfig,
): string | undefined {
  const modelWithoutProviderPrefix = requestedModel.startsWith(`${providerId}/`)
    ? requestedModel.slice(providerId.length + 1)
    : undefined

  if (Array.isArray(provider.models)) {
    if (provider.models.includes(requestedModel)) {
      return requestedModel
    }
    if (
      modelWithoutProviderPrefix !== undefined &&
      provider.models.includes(modelWithoutProviderPrefix)
    ) {
      return modelWithoutProviderPrefix
    }
    return undefined
  }

  if (requestedModel in provider.models) {
    return provider.models[requestedModel]
  }
  if (
    modelWithoutProviderPrefix !== undefined &&
    modelWithoutProviderPrefix in provider.models
  ) {
    return provider.models[modelWithoutProviderPrefix]
  }

  return undefined
}

function mergeDefined<T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (!base && !override) return undefined

  const merged = { ...(base ?? {}) } as T
  const mutableMerged = merged as Record<string, unknown>
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value !== undefined) {
      mutableMerged[key] = value
    }
  }
  return merged
}

function mergeModelCapabilities(
  ...capabilities: Array<ModelCapabilities | undefined>
): ModelCapabilities {
  const merged: ModelCapabilities = {}

  for (const capability of capabilities) {
    if (!capability) continue
    merged.context = mergeDefined(merged.context, capability.context)
    merged.reasoning = mergeDefined(merged.reasoning, capability.reasoning)
    merged.tools = mergeDefined(merged.tools, capability.tools)
    merged.promptCaching = mergeDefined(
      merged.promptCaching,
      capability.promptCaching,
    )
    merged.pricing = mergeDefined(merged.pricing, capability.pricing)
    merged.quality = mergeDefined(merged.quality, capability.quality)
  }

  return merged
}

function compactCapability(capabilities: ModelCapabilities): ModelCapabilities {
  return Object.fromEntries(
    Object.entries(capabilities).filter(([, value]) => {
      if (!value) return false
      return Object.values(value).some((field) => field !== undefined)
    }),
  ) as ModelCapabilities
}

function capabilityModelKeyCandidates(params: {
  providerId: string
  model: string
  provider: ProviderConfig
}): string[] {
  const { providerId, model, provider } = params
  const modelWithoutProviderPrefix = model.startsWith(`${providerId}/`)
    ? model.slice(providerId.length + 1)
    : undefined
  const providerModel = getModelMapping(providerId, model, provider)

  return Array.from(
    new Set(
      [
        providerModel,
        providerModel ? `${providerId}/${providerModel}` : undefined,
        modelWithoutProviderPrefix,
        model,
      ].filter((candidate): candidate is string => Boolean(candidate)),
    ),
  )
}

function getFirstModelValue<T>(
  values: Record<string, T> | undefined,
  candidates: string[],
): T | undefined {
  if (!values) return undefined
  for (const candidate of candidates) {
    if (candidate in values) {
      return values[candidate]
    }
  }
  return undefined
}

function getLegacyModelCapabilities(params: {
  provider: ProviderConfig
  candidates: string[]
}): ModelCapabilities {
  const { provider, candidates } = params
  const compatibility = {
    ...DEFAULT_PROVIDER_COMPATIBILITY,
    ...(provider.compatibility ?? {}),
  }
  const modelContextWindowTokens = getFirstModelValue(
    provider.modelContextWindowTokens,
    candidates,
  )
  const windowTokens = modelContextWindowTokens ?? provider.contextWindowTokens

  return compactCapability({
    context: windowTokens ? { windowTokens } : undefined,
    tools: {
      supported: compatibility.supportsTools,
      requiredToolChoice: compatibility.supportsRequiredToolChoice,
      structuredOutputs:
        provider.type === 'openai-compatible'
          ? provider.supportsStructuredOutputs
          : undefined,
    },
    promptCaching: {
      supported: compatibility.stripCacheControl === false,
    },
  })
}

export function resolveModelCapabilities(params: {
  providerId: string
  model: string
  loadedConfig?: LoadedProviderConfig
}): ModelCapabilities {
  const { providerId, model, loadedConfig = loadProviderConfigSync() } = params
  const provider = loadedConfig.config.providers[providerId]
  if (!provider) {
    return {}
  }

  const candidates = capabilityModelKeyCandidates({
    providerId,
    model,
    provider,
  })
  const modelCapabilityOverrides = candidates
    .map((candidate) => provider.modelCapabilities?.[candidate])
    .filter((capabilities): capabilities is ModelCapabilities =>
      Boolean(capabilities),
    )

  return compactCapability(
    mergeModelCapabilities(
      getLegacyModelCapabilities({ provider, candidates }),
      provider.defaultCapabilities,
      ...modelCapabilityOverrides,
    ),
  )
}

function formatCompactNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${formatCompactNumber(tokens / 1_000_000)}M`
  }
  if (tokens >= 1_000) {
    return `${formatCompactNumber(tokens / 1_000)}k`
  }
  return String(tokens)
}

function formatPrice(value: number): string {
  return value < 1 ? value.toFixed(2) : formatCompactNumber(value)
}

export function formatModelCapabilitiesSummary(
  capabilities: ModelCapabilities | undefined,
): string {
  if (!capabilities) return ''

  const parts: string[] = []
  if (capabilities.context?.windowTokens) {
    parts.push(`${formatTokenCount(capabilities.context.windowTokens)} ctx`)
  }
  if (capabilities.context?.outputTokens) {
    parts.push(`${formatTokenCount(capabilities.context.outputTokens)} out`)
  }

  const reasoning = capabilities.reasoning
  if (reasoning?.supported === false) {
    parts.push('no reasoning')
  } else if (reasoning?.efforts?.length) {
    parts.push(`reasoning ${reasoning.efforts.join('/')}`)
  } else if (reasoning?.defaultEffort) {
    parts.push(`reasoning ${reasoning.defaultEffort}`)
  } else if (reasoning?.supported) {
    parts.push('reasoning')
  }

  const tools = capabilities.tools
  if (tools?.supported === false) {
    parts.push('no tools')
  } else if (
    tools?.supported ||
    tools?.requiredToolChoice !== undefined ||
    tools?.structuredOutputs
  ) {
    const toolParts = ['tools']
    if (tools.requiredToolChoice === true) toolParts.push('required')
    if (tools.requiredToolChoice === false) toolParts.push('no-required')
    if (tools.structuredOutputs) toolParts.push('structured')
    parts.push(toolParts.join('+'))
  }

  const promptCaching = capabilities.promptCaching
  if (promptCaching?.supported) {
    parts.push('prompt-cache')
  }

  const pricing = capabilities.pricing
  if (
    pricing?.inputPerMillionTokens !== undefined ||
    pricing?.outputPerMillionTokens !== undefined
  ) {
    const currency = pricing.currency ?? 'USD'
    const prefix = currency === 'USD' ? '$' : `${currency} `
    const input =
      pricing.inputPerMillionTokens !== undefined
        ? `${prefix}${formatPrice(pricing.inputPerMillionTokens)}`
        : '?'
    const output =
      pricing.outputPerMillionTokens !== undefined
        ? `${prefix}${formatPrice(pricing.outputPerMillionTokens)}`
        : '?'
    parts.push(`${input}/${output}/M`)
  }

  const quality = capabilities.quality
  const qualityLabel =
    quality?.label ??
    quality?.tier ??
    (quality?.score !== undefined ? `${quality.score}/100` : undefined)
  if (qualityLabel) {
    parts.push(`quality ${qualityLabel}`)
  }

  return parts.join('; ')
}

function normalizeAgentIdCandidates(agentId: string | undefined): string[] {
  if (!agentId) return []

  const withoutVersion = agentId.split('@')[0] ?? agentId
  const withoutPublisher = withoutVersion.includes('/')
    ? withoutVersion.split('/').at(-1)!
    : withoutVersion
  const dashed = withoutPublisher.replaceAll('_', '-')
  const underscored = withoutPublisher.replaceAll('-', '_')

  return Array.from(
    new Set([agentId, withoutVersion, withoutPublisher, dashed, underscored]),
  )
}

type ProviderMode = ProviderModeName

const modeAgentIds: Record<ProviderMode, string[]> = {
  default: ['base', 'base2'],
  lite: ['base-lite', 'base2-lite', 'base2-free'],
  max: ['base-max', 'base2-max'],
  plan: ['base-plan', 'base2-plan'],
}

function resolveModeForAgentId(
  agentId: string | undefined,
): ProviderMode | undefined {
  const candidates = normalizeAgentIdCandidates(agentId)
  for (const [mode, agentIds] of Object.entries(modeAgentIds)) {
    if (candidates.some((candidate) => agentIds.includes(candidate))) {
      return mode as ProviderMode
    }
  }
  return undefined
}

export type ResolvedAgentModelConfig = {
  model: string
  reasoningEffort?: OpenbuffReasoningEffort
}

export function resolveConfiguredAgentModelConfig(params: {
  agentId?: string
  model: string
  loadedConfig?: LoadedProviderConfig
}): ResolvedAgentModelConfig {
  const { agentId, model, loadedConfig = loadProviderConfigSync() } = params
  const agentModels = loadedConfig.config.agents ?? {}
  const agentReasoningEfforts = loadedConfig.config.agentReasoningEfforts ?? {}

  const mode = resolveModeForAgentId(agentId)
  if (mode && loadedConfig.config.modes?.[mode]) {
    return {
      model: loadedConfig.config.modes[mode],
      reasoningEffort: loadedConfig.config.modeReasoningEfforts?.[mode],
    }
  }

  for (const candidate of normalizeAgentIdCandidates(agentId)) {
    const configuredModel = agentModels[candidate]
    if (configuredModel) {
      return {
        model: configuredModel,
        reasoningEffort: agentReasoningEfforts[candidate],
      }
    }
  }

  return {
    model: loadedConfig.config.defaultModel ?? model,
    reasoningEffort: loadedConfig.config.defaultReasoningEffort,
  }
}

export function resolveConfiguredAgentModel(params: {
  agentId?: string
  model: string
  loadedConfig?: LoadedProviderConfig
}): string {
  return resolveConfiguredAgentModelConfig(params).model
}

export function resolveConfiguredProviderModel(params: {
  model: string
  env?: NodeJS.ProcessEnv
  loadedConfig?: LoadedProviderConfig
}): ResolvedProviderModel | undefined {
  const { model, env = getSystemProcessEnv() } = params
  const loadedConfig =
    params.loadedConfig ?? loadProviderConfigSync({ env })

  for (const [providerId, provider] of Object.entries(
    loadedConfig.config.providers,
  )) {
    const providerModel = getModelMapping(providerId, model, provider)
    if (providerModel === undefined) {
      continue
    }

    const apiKey =
      provider.type === 'openai-compatible' && provider.apiKeyEnv
        ? env[provider.apiKeyEnv]
        : undefined
    if (
      provider.type === 'openai-compatible' &&
      provider.apiKeyEnv &&
      !apiKey
    ) {
      throw new Error(
        `Missing environment variable '${provider.apiKeyEnv}' required for configured provider '${providerId}' and model '${model}'.`,
      )
    }

    return {
      providerId,
      provider,
      requestedModel: model,
      providerModel,
      apiKey,
      compatibility: {
        ...DEFAULT_PROVIDER_COMPATIBILITY,
        ...(provider.compatibility ?? {}),
      },
    }
  }

  return undefined
}

export type OpenbuffProviderPreset = {
  id: string
  label: string
  description: string
  config: ProviderConfigFileInput
  envHelp?: string
}

const OPENCODE_GO_MODELS = [
  'glm-5.1',
  'glm-5',
  'kimi-k2.6',
  'kimi-k2.5',
  'mimo-v2.5-pro',
  'mimo-v2.5',
  'qwen3.6-plus',
  'qwen3.5-plus',
  'minimax-m2.7',
  'minimax-m2.5',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
] as const

const OPENAI_API_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.2-chat-latest',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.1',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
] as const

export const OPENBUFF_PROVIDER_PRESETS = {
  'opencode-go': {
    id: 'opencode-go',
    label: 'OpenCode Go',
    description:
      'OpenCode Go subscription endpoint with GLM, Kimi, MiMo, Qwen, MiniMax, and DeepSeek coding models.',
    envHelp: 'export OPENCODE_GO_API_KEY="your_opencode_go_key"',
    config: {
      defaultModel: 'opencode-go/kimi-k2.6',
      modes: {
        default: 'opencode-go/kimi-k2.6',
        lite: 'opencode-go/deepseek-v4-flash',
        max: 'opencode-go/glm-5.1',
        plan: 'opencode-go/glm-5.1',
      },
      editorMultiPrompt: {
        proposalModels: [
          'opencode-go/kimi-k2.6',
          'opencode-go/glm-5.1',
          'opencode-go/deepseek-v4-pro',
        ],
        selectorModel: 'opencode-go/glm-5.1',
      },
      providers: {
        'opencode-go': {
          type: 'openai-compatible',
          baseURL: 'https://opencode.ai/zen/go/v1',
          apiKeyEnv: 'OPENCODE_GO_API_KEY',
          supportsStructuredOutputs: false,
          compatibility: {
            stripCacheControl: true,
            stringifyTextContent: true,
            supportsTools: true,
            supportsRequiredToolChoice: true,
            stripProviderMetadata: true,
          },
          models: [...OPENCODE_GO_MODELS],
        },
      },
    },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI API',
    description:
      'OpenAI Chat Completions-compatible route using GPT-5.5 for flagship coding and GPT-5.4 mini for lite mode.',
    envHelp: 'export OPENAI_API_KEY="your_openai_api_key"',
    config: {
      defaultModel: 'openai/gpt-5.5',
      modes: {
        default: 'openai/gpt-5.5',
        lite: 'openai/gpt-5.4-mini',
        max: 'openai/gpt-5.5',
        plan: 'openai/gpt-5.5',
      },
      editorMultiPrompt: {
        proposalModels: [
          'openai/gpt-5.5',
          'openai/gpt-5.4',
          'openai/gpt-5.2-chat-latest',
        ],
        selectorModel: 'openai/gpt-5.5',
      },
      providers: {
        openai: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          apiKeyEnv: 'OPENAI_API_KEY',
          supportsStructuredOutputs: true,
          models: [...OPENAI_API_MODELS],
        },
      },
    },
  },
  codex: {
    id: 'codex',
    label: 'Codex / ChatGPT subscription',
    description:
      'ChatGPT subscription OAuth provider. Route any mode or agent to it after /connect.',
    envHelp:
      'Run /connect to authorize your ChatGPT/Codex subscription, then route modes or agents to codex/<model>.',
    config: {
      defaultModel: 'codex/gpt-5.5',
      modes: {
        default: 'codex/gpt-5.5',
        lite: 'codex/gpt-5.4-mini',
        max: 'codex/gpt-5.5',
        plan: 'codex/gpt-5.5',
      },
      editorMultiPrompt: {
        proposalModels: [
          'codex/gpt-5.5',
          'codex/gpt-5.4',
          'codex/gpt-5.2-chat-latest',
        ],
        selectorModel: 'codex/gpt-5.5',
      },
      providers: {
        codex: {
          type: 'chatgpt-oauth',
          models: Array.from(
            new Set([
              ...CHATGPT_OAUTH_OPENAI_MODEL_ALLOWLIST.map((model) =>
                model.replace(/^openai\//, ''),
              ),
              'gpt-5.1-codex',
            ]),
          ),
        },
      },
    },
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    description:
      'OpenRouter with Claude Sonnet for primary work and GPT-4.1 mini for lite mode.',
    envHelp: 'export OPENROUTER_API_KEY="your_openrouter_api_key"',
    config: {
      defaultModel: 'openrouter/anthropic/claude-sonnet-4.5',
      modes: {
        default: 'openrouter/anthropic/claude-sonnet-4.5',
        lite: 'openrouter/openai/gpt-4.1-mini',
        max: 'openrouter/anthropic/claude-opus-4.1',
        plan: 'openrouter/anthropic/claude-sonnet-4.5',
      },
      providers: {
        openrouter: {
          type: 'openai-compatible',
          baseURL: 'https://openrouter.ai/api/v1',
          apiKeyEnv: 'OPENROUTER_API_KEY',
          supportsStructuredOutputs: false,
          models: [
            'anthropic/claude-sonnet-4.5',
            'anthropic/claude-opus-4.1',
            'openai/gpt-4.1-mini',
          ],
        },
      },
    },
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama local',
    description:
      'Local Ollama OpenAI-compatible endpoint. Edit model IDs to match what you pulled.',
    envHelp: 'No API key needed for the default localhost Ollama endpoint.',
    config: {
      defaultModel: 'ollama/qwen2.5-coder:32b',
      modes: {
        default: 'ollama/qwen2.5-coder:32b',
        lite: 'ollama/qwen2.5-coder:7b',
        max: 'ollama/qwen2.5-coder:32b',
        plan: 'ollama/qwen2.5-coder:32b',
      },
      providers: {
        ollama: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:11434/v1',
          supportsStructuredOutputs: false,
          models: ['qwen2.5-coder:32b', 'qwen2.5-coder:7b'],
        },
      },
    },
  },
  glm: {
    id: 'glm',
    label: 'GLM/Z.ai coding plan',
    description:
      'GLM OpenAI-compatible endpoint. Adjust baseURL/model IDs for your coding plan.',
    envHelp: 'export GLM_API_KEY="your_glm_or_zai_api_key"',
    config: {
      defaultModel: 'glm/glm-4.6',
      modes: {
        default: 'glm/glm-4.6',
        lite: 'glm/glm-4.5-air',
        max: 'glm/glm-4.6',
        plan: 'glm/glm-4.6',
      },
      providers: {
        glm: {
          type: 'openai-compatible',
          baseURL: 'https://open.bigmodel.cn/api/paas/v4',
          apiKeyEnv: 'GLM_API_KEY',
          supportsStructuredOutputs: false,
          models: ['glm-4.6', 'glm-4.5-air'],
        },
      },
    },
  },
  bedrock: {
    id: 'bedrock',
    label: 'AWS Bedrock',
    description:
      'AWS Bedrock OpenAI-compatible endpoint. Update baseURL to your region.',
    envHelp: 'export AWS_BEARER_TOKEN_BEDROCK="your_bedrock_api_key"',
    config: {
      defaultModel: 'bedrock/apac.anthropic.claude-sonnet-4-6',
      modes: {
        default: 'bedrock/apac.anthropic.claude-sonnet-4-6',
        lite: 'bedrock/apac.anthropic.claude-haiku-4-5-20251001-v1:0',
        max: 'bedrock/apac.anthropic.claude-opus-4-8',
        plan: 'bedrock/apac.anthropic.claude-sonnet-4-6',
      },
      editorMultiPrompt: {
        proposalModels: [
          'bedrock/apac.anthropic.claude-sonnet-4-6',
          'bedrock/apac.anthropic.claude-opus-4-8',
          'bedrock/apac.anthropic.claude-sonnet-4-5-20250929-v1:0',
        ],
        selectorModel: 'bedrock/apac.anthropic.claude-opus-4-8',
      },
      providers: {
        bedrock: {
          type: 'openai-compatible',
          baseURL: 'https://bedrock-mantle.ap-northeast-1.api.aws/v1',
          apiKeyEnv: 'AWS_BEARER_TOKEN_BEDROCK',
          supportsStructuredOutputs: false,
          models: [
            'apac.anthropic.claude-opus-4-8',
            'apac.anthropic.claude-sonnet-4-6',
            'apac.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'apac.anthropic.claude-haiku-4-5-20251001-v1:0',
            'apac.anthropic.claude-sonnet-4-20250514-v1:0',
            'us.amazon.nova-premier-v1:0',
            'us.amazon.nova-pro-v1:0',
            'us.meta.llama3-3-70b-instruct-v1:0',
          ],
        },
      },
    },
  },
  freemodel: {
    id: 'freemodel',
    label: 'Free Model',
    description:
      'Free Model OpenAI-compatible endpoint with gpt-5.5 for flagship coding and gpt-5.4-mini for lite mode.',
    envHelp: 'export FREEMODEL_API_KEY="your_freemodel_api_key"',
    config: {
      defaultModel: 'freemodel/gpt-5.5',
      modes: {
        default: 'freemodel/gpt-5.5',
        lite: 'freemodel/gpt-5.4-mini',
        max: 'freemodel/gpt-5.5',
        plan: 'freemodel/gpt-5.5',
      },
      editorMultiPrompt: {
        proposalModels: [
          'freemodel/gpt-5.5',
          'freemodel/gpt-5.4',
          'freemodel/gpt-5.3-codex',
        ],
        selectorModel: 'freemodel/gpt-5.5',
      },
      providers: {
        freemodel: {
          type: 'openai-compatible',
          baseURL: 'https://vip-sg.freemodel.dev/v1',
          apiKeyEnv: 'FREEMODEL_API_KEY',
          supportsStructuredOutputs: false,
          models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
        },
      },
    },
  },
} satisfies Record<string, OpenbuffProviderPreset>

export function createProviderPresetConfig(
  presetId: keyof typeof OPENBUFF_PROVIDER_PRESETS | string,
): ProviderConfigFile {
  const preset =
    OPENBUFF_PROVIDER_PRESETS[
      presetId as keyof typeof OPENBUFF_PROVIDER_PRESETS
    ]
  if (!preset) {
    throw new Error(`Unknown Openbuff provider preset '${presetId}'.`)
  }
  const parseResult = providerConfigFileSchema.safeParse(preset.config)
  if (!parseResult.success) {
    throw new Error(
      `Invalid built-in Openbuff provider preset '${presetId}': ${parseResult.error.message}`,
    )
  }
  return parseResult.data
}

export function getProjectProviderConfigPath(cwd = process.cwd()): string {
  return path.join(cwd, PROVIDER_CONFIG_FILE_NAME)
}

export function writeProviderConfigFile(params: {
  cwd?: string
  config: ProviderConfigFileInput
  force?: boolean
}): string {
  const configPath = getProjectProviderConfigPath(params.cwd)

  const parseResult = providerConfigFileSchema.safeParse(params.config)
  if (!parseResult.success) {
    throw new Error(
      `Invalid Openbuff provider config: ${parseResult.error.message}`,
    )
  }

  const newConfig = parseResult.data

  if (fs.existsSync(configPath) && !params.force) {
    let existingConfig: ProviderConfigFile
    try {
      existingConfig = readProviderConfigFile(configPath)
    } catch (error) {
      throw new Error(
        `Cannot merge with existing config at ${configPath}: ${error instanceof Error ? error.message : String(error)}. Use --force to overwrite it.`,
      )
    }

    // Merge providers from the new preset, but preserve user's existing
    // defaultModel, modes, and agents so /setup only adds providers.
    const mergedConfig: ProviderConfigFile = {
      providers: {
        ...existingConfig.providers,
        ...newConfig.providers,
      },
      defaultModel: existingConfig.defaultModel ?? newConfig.defaultModel,
      defaultReasoningEffort:
        existingConfig.defaultReasoningEffort ??
        newConfig.defaultReasoningEffort,
      modes: {
        ...(newConfig.modes ?? {}),
        ...(existingConfig.modes ?? {}),
      },
      modeReasoningEfforts: {
        ...(newConfig.modeReasoningEfforts ?? {}),
        ...(existingConfig.modeReasoningEfforts ?? {}),
      },
      agents: {
        ...(newConfig.agents ?? {}),
        ...(existingConfig.agents ?? {}),
      },
      agentReasoningEfforts: {
        ...(newConfig.agentReasoningEfforts ?? {}),
        ...(existingConfig.agentReasoningEfforts ?? {}),
      },
      editorMultiPrompt:
        existingConfig.editorMultiPrompt ?? newConfig.editorMultiPrompt,
    }

    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2) + '\n')
    return configPath
  }

  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n')
  return configPath
}

export function getMissingProviderEnvVars(
  params: {
    loadedConfig?: LoadedProviderConfig
    env?: NodeJS.ProcessEnv
  } = {},
): string[] {
  const env = params.env ?? getSystemProcessEnv()
  const loadedConfig =
    params.loadedConfig ?? loadProviderConfigSync({ env })
  const missing = new Set<string>()
  for (const provider of Object.values(loadedConfig.config.providers)) {
    if (
      provider.type === 'openai-compatible' &&
      provider.apiKeyEnv &&
      !env[provider.apiKeyEnv]
    ) {
      missing.add(provider.apiKeyEnv)
    }
  }
  return Array.from(missing).sort()
}

export function describeLoadedProviderConfig(
  loadedConfig = loadProviderConfigSync(),
): string {
  const lines: string[] = []
  lines.push(
    `Config: ${
      loadedConfig.sourceFilePaths.length
        ? loadedConfig.sourceFilePaths.join(', ')
        : 'not found'
    }`,
  )
  lines.push(`Default model: ${loadedConfig.config.defaultModel ?? '(none)'}`)
  lines.push(
    `Modes: ${
      Object.entries(loadedConfig.config.modes ?? {})
        .map(([mode, model]) => `${mode}=${model}`)
        .join(', ') || '(none)'
    }`,
  )
  if (loadedConfig.config.editorMultiPrompt) {
    lines.push(
      `Editor multi-prompt: proposals=${
        loadedConfig.config.editorMultiPrompt.proposalModels?.join(', ') ??
        '(default agents)'
      }; selector=${
        loadedConfig.config.editorMultiPrompt.selectorModel ?? '(default agent)'
      }`,
    )
  }
  const providers = Object.entries(loadedConfig.config.providers)
  lines.push(`Providers: ${providers.length ? providers.length : '(none)'}`)
  for (const [providerId, provider] of providers) {
    const models = Array.isArray(provider.models)
      ? provider.models.join(', ')
      : Object.entries(provider.models)
          .map(([from, to]) => `${from}->${to}`)
          .join(', ')
    if (provider.type === 'chatgpt-oauth') {
      lines.push(`- ${providerId}: ChatGPT/Codex OAuth | models=${models}`)
    } else {
      lines.push(
        `- ${providerId}: ${provider.baseURL} | env=${provider.apiKeyEnv ?? '(none)'} | models=${models}`,
      )
    }
  }
  const missing = getMissingProviderEnvVars({ loadedConfig })
  if (missing.length) {
    lines.push(`Missing env: ${missing.join(', ')}`)
  }
  return lines.join('\n')
}
