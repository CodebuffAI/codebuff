import fs from 'fs'
import os from 'os'
import path from 'path'

import { z } from 'zod/v4'

import { CHATGPT_OAUTH_OPENAI_MODEL_ALLOWLIST } from '@codebuff/common/constants/chatgpt-oauth'

import { getConfigDir } from './credentials'
import { getSystemProcessEnv } from './env'

import type { FileChangeHook } from './tools/file-change-hooks'

export const PROVIDER_CONFIG_ENV_VAR = 'OPENBUFF_PROVIDER_CONFIG'
const PROVIDER_CONFIG_FILE_NAME = 'openbuff.json'
const GLOBAL_PROVIDER_CONFIG_FILE_NAME = 'provider-config.json'

// Maximum number of ancestor directories to scan for provider config files.
// A monorepo workspace root is typically 3-5 levels above a subpackage; this
// ceiling comfortably covers that while guaranteeing the walk never reaches
// the filesystem root. See C1.3 (ancestor config injection).
const MAX_ANCESTOR_SCAN_DEPTH = 10

const configFragmentPathsSchema = z
  .union([z.string().min(1), z.array(z.string().min(1))])
  .optional()

const envVarNameSchema = z
  .string()
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    'apiKeyEnv must be an environment variable name like OPENAI_API_KEY',
  )

const modelMapSchema = z.record(z.string().min(1), z.string().min(1))
const positiveIntSchema = z.number().int().positive()
const nonNegativeNumberSchema = z.number().nonnegative()
const providerModeNames = ['default', 'plan', 'executePlan'] as const
type ProviderModeName = (typeof providerModeNames)[number]
export const reasoningEffortSchema = z.enum([
  'high',
  'medium',
  'low',
  'minimal',
  'none',
])
export type OpenbuffReasoningEffort = z.infer<typeof reasoningEffortSchema>
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
    plan: routableModelValueSchema.optional(),
    executePlan: routableModelValueSchema.optional(),
  })
  .default({})

export const DEFAULT_PROVIDER_COMPATIBILITY = {
  stripCacheControl: true,
  stringifyTextContent: true,
  supportsTools: true,
  supportsRequiredToolChoice: true,
  supportsStopSequences: false,
  stripProviderMetadata: true,
} as const

// Anthropic Messages API speaks the real protocol: it accepts cache_control
// provider metadata, structured tool content, and provider metadata.
// Defaulting these to the Anthropic-friendly values turns on prompt caching
// and avoids the OpenAI-compatible downgrades. Used by any endpoint flagged
// `anthropic-compatible` (the official API or a compatible gateway).
export const DEFAULT_ANTHROPIC_COMPATIBILITY = {
  stripCacheControl: false,
  stringifyTextContent: false,
  supportsTools: true,
  supportsRequiredToolChoice: true,
  supportsStopSequences: true,
  stripProviderMetadata: false,
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
    /** If false, Openbuff enforces stop sequences locally without sending `stop` to the provider. */
    supportsStopSequences: z.boolean().default(false),
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
  /** Whether discovery sends the provider Authorization header. */
  auth: z.enum(['auto', 'provider', 'none']).default('auto'),
  /** JSON path to the models array in the response. Defaults vary by strategy ("data" for openai-compatible, "models" for ollama). */
  arrayPath: z.string().min(1).optional(),
  /** JSON path to the model id field within each model object. Defaults vary by strategy ("id" for openai-compatible, "name" for ollama). */
  idPath: z.string().min(1).optional(),
})

export type ProviderDiscovery = z.infer<typeof providerDiscoverySchema>
export type ProviderDiscoveryInput = z.input<typeof providerDiscoverySchema>

export const modelCapabilitiesSchema = z.object({
  input: z
    .object({
      image: z.boolean().optional(),
      file: z.boolean().optional(),
    })
    .optional(),
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
      /** Empirical coding scores only. Omit dimensions that have not been measured. */
      coding: z
        .array(
          z.object({
            score: z.number().min(0).max(100),
            language: z.string().min(1).optional(),
            taskType: z.string().min(1).optional(),
            agentRole: z.string().min(1).optional(),
            sampleSize: positiveIntSchema.optional(),
            measuredAt: z.string().min(1).optional(),
            benchmark: z.string().min(1).optional(),
          }),
        )
        .optional(),
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

const anthropicCompatibilitySchema = z
  .object({
    stripCacheControl: z.boolean().default(false),
    stringifyTextContent: z.boolean().default(false),
    supportsTools: z.boolean().default(true),
    supportsRequiredToolChoice: z.boolean().default(true),
    supportsStopSequences: z.boolean().default(true),
    stripProviderMetadata: z.boolean().default(false),
  })
  .default(DEFAULT_ANTHROPIC_COMPATIBILITY)

const anthropicProviderSchema = z
  .object({
    type: z.literal('anthropic-compatible'),
    /**
     * API root. A bare host (e.g. https://cc.freemodel.dev) is treated as the
     * root and requests go to <baseURL>/v1/messages (Claude Code convention).
     * Defaults to the official Anthropic API.
     */
    baseURL: z
      .string()
      .url()
      .refine((value) => {
        const protocol = new URL(value).protocol
        return protocol === 'https:' || protocol === 'http:'
      }, 'baseURL must use http or https')
      .default('https://api.anthropic.com'),
    apiKeyEnv: envVarNameSchema.optional(),
    models: z.union([z.array(z.string().min(1)), modelMapSchema]),
    compatibility: anthropicCompatibilitySchema,
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

const providerSchema = z.union([
  openAICompatibleProviderSchema,
  chatGptOAuthProviderSchema,
  anthropicProviderSchema,
])

const DEFAULT_INDEXING_CONFIG = {
  enabled: true,
  cacheDir: '.codebuff-index',
  exclude: [] as string[],
  semantic: {
    enabled: false,
    model: undefined as string | undefined,
  },
}

const indexingConfigSchema = z
  .object({
    /** Build a lightweight local repository index for faster file discovery. */
    enabled: z.boolean().default(true),
    /** Cache directory relative to the project root. */
    cacheDir: z
      .string()
      .regex(
        /^\.[A-Za-z0-9._-]+$/,
        'indexing.cacheDir must be a single hidden directory name',
      )
      .refine((value) => value !== '.git', 'indexing.cacheDir cannot be .git')
      .default('.codebuff-index'),
    /** Additional path patterns or directory names to exclude from indexing. */
    exclude: z.array(z.string().min(1)).default([]),
    /** Maximum files to index before reporting partial coverage. */
    maxFiles: z.number().int().min(100).max(100_000).optional(),
    /** Optional BYOK semantic indexing. Sends bounded file samples to the configured embedding model. */
    semantic: z
      .object({
        enabled: z.boolean().default(false),
        model: z.string().min(1).optional(),
      })
      .refine((value) => !value.enabled || Boolean(value.model), {
        message:
          'indexing.semantic.model is required when semantic indexing is enabled',
        path: ['model'],
      })
      .default(DEFAULT_INDEXING_CONFIG.semantic),
    /**
     * Optional indexing ranking weights used to tune lexical, graph, and
     * semantic-blend scoring. Every field is optional; when `weights` is
     * omitted entirely the indexer falls back to its historical hardcoded
     * defaults (lexical, graph, and `semanticBlend`), so this stays fully
     * backwards compatible. The field names mirror `IndexingWeights` in the
     * indexer package but the schema is defined inline to keep the SDK
     * self-contained. Values are finite numbers (no positivity constraint —
     * `0` is valid to disable an edge type, and fractional defaults like 2.5
     * and 0.6 are supported).
     */
    weights: z
      .object({
        lexical: z
          .object({
            fileName: nonNegativeNumberSchema.optional(),
            path: nonNegativeNumberSchema.optional(),
            symbol: nonNegativeNumberSchema.optional(),
            heading: nonNegativeNumberSchema.optional(),
            concept: nonNegativeNumberSchema.optional(),
            import: nonNegativeNumberSchema.optional(),
          })
          .optional(),
        graph: z
          .object({
            defines: nonNegativeNumberSchema.optional(),
            imports: nonNegativeNumberSchema.optional(),
            references: nonNegativeNumberSchema.optional(),
            containsHeading: nonNegativeNumberSchema.optional(),
            mentions: nonNegativeNumberSchema.optional(),
            calls: nonNegativeNumberSchema.optional(),
          })
          .optional(),
        semanticBlend: nonNegativeNumberSchema.optional(),
      })
      .optional(),
  })
  .default(DEFAULT_INDEXING_CONFIG)

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
    /** Base config fragment(s) loaded before this file. Relative paths resolve from the declaring file. */
    extends: configFragmentPathsSchema,
    /** Additional config fragment(s) loaded before this file. Relative paths resolve from the declaring file. */
    include: configFragmentPathsSchema,
    /** Alias for `include`, useful when a config is split into several peer files. */
    includes: configFragmentPathsSchema,
    providers: z.record(z.string().min(1), providerSchema).optional(),
    provider: z.record(z.string().min(1), providerSchema).optional(),
    /** Model used for any agent without an explicit entry in `agents`. */
    defaultModel: routableModelValueSchema.optional(),
    /** Optional reasoning effort for the default fallback model. */
    defaultReasoningEffort: reasoningEffortSchema.optional(),
    /** Model used when the request contains image inputs and the selected model is not known to support them. */
    visionModel: routableModelValueSchema.optional(),
    /** Optional reasoning effort for the vision fallback model. */
    visionReasoningEffort: reasoningEffortSchema.optional(),
    /**
     * Ordered list of model IDs to attempt as backup providers when the primary
     * model fails with an auth error (401/403) or a persistent 5xx after the
     * inner retry loop exhausts its retries. Model IDs (not provider IDs) — the
     * routing layer maps each to its configured provider. Failover only fires
     * when NO content has been yielded yet, so partial output is never
     * duplicated. 429/408 are retry-only (not failover-eligible) to avoid
     * cascading load across providers.
     */
    failoverModels: z.array(z.string().min(1)).optional(),
    /** Mode-level aliases for the built-in root agents. */
    modes: modeModelSchema,
    /** Optional reasoning efforts for built-in root modes. */
    modeReasoningEfforts: z
      .object({
        default: reasoningEffortSchema.optional(),
        plan: reasoningEffortSchema.optional(),
        executePlan: reasoningEffortSchema.optional(),
      })
      .default({}),
    /** Per-agent requested model overrides. Keys are agent IDs; values are provider-resolvable model IDs. */
    agents: z.record(z.string().min(1), agentModelValueSchema).optional(),
    /** Optional per-agent reasoning efforts. Keys are agent IDs. */
    agentReasoningEfforts: z
      .record(z.string().min(1), reasoningEffortSchema)
      .optional(),
    /** When enabled, choose a phase-appropriate reasoning effort only when no explicit mode/agent/default effort is configured. Model routing is never changed. */
    adaptiveReasoning: z.boolean().optional(),
    /** Local codebase indexing configuration. Enabled by default for metadata-only indexing. */
    indexing: indexingConfigSchema,
    /**
     * Commands run by the run_file_change_hooks tool after the agent edits files
     * (e.g. typecheck/lint/test) — the verification gate. Each hook runs when its
     * optional filePattern (glob) matches a changed file, or always if omitted.
     */
    fileChangeHooks: z
      .array(
        z.object({
          name: z.string().min(1).optional(),
          command: z.string().min(1),
          filePattern: z.string().min(1).optional(),
          /** Per-hook override of the default 180s hook timeout, in seconds. */
          timeoutSeconds: z.number().int().positive().max(3600).optional(),
        }),
      )
      .default([]),
    /** Explicit trust boundary for manifest-inferred commands. These may execute repository-controlled build scripts/plugins. Default is disabled; set true only for trusted projects. */
    autoFileChangeHooks: z.boolean().optional(),
    /** Approval UX for classified terminal effects. */
    approvalMode: z.enum(['balanced', 'strict', 'allow-all']).optional(),
    /**
     * Optional fixed agent-step cap. Unset or -1 means unlimited productive
     * steps; a repeated-step watchdog still stops identical no-progress loops.
     */
    maxAgentSteps: z
      .union([z.literal(-1), z.number().int().positive().max(100000)])
      .optional(),
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

    const defaultModel = routableModelValueToModel(config.defaultModel)
    const defaultReasoningEffort =
      routableModelValueToReasoningEffort(config.defaultModel) ??
      config.defaultReasoningEffort
    const visionModel = routableModelValueToModel(config.visionModel)
    const visionReasoningEffort =
      routableModelValueToReasoningEffort(config.visionModel) ??
      config.visionReasoningEffort

    return {
      providers: {
        ...(config.provider ?? {}),
        ...(config.providers ?? {}),
      },
      defaultModel,
      defaultReasoningEffort,
      ...(visionModel !== undefined && { visionModel }),
      ...(visionReasoningEffort !== undefined && { visionReasoningEffort }),
      ...(config.failoverModels !== undefined && {
        failoverModels: config.failoverModels,
      }),
      modes,
      modeReasoningEfforts,
      agents,
      agentReasoningEfforts,
      ...(config.adaptiveReasoning !== undefined && {
        adaptiveReasoning: config.adaptiveReasoning,
      }),
      indexing: config.indexing,
      fileChangeHooks: config.fileChangeHooks,
      ...(config.autoFileChangeHooks !== undefined && {
        autoFileChangeHooks: config.autoFileChangeHooks,
      }),
      ...(config.approvalMode !== undefined && {
        approvalMode: config.approvalMode,
      }),
      // Optional in the resolved config: omitted unless explicitly set, so
      // callers use the unlimited default plus the no-progress watchdog.
      ...(config.maxAgentSteps !== undefined && {
        maxAgentSteps: config.maxAgentSteps,
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
export type AnthropicProviderConfig = Extract<
  ProviderConfig,
  { type: 'anthropic-compatible' }
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
  diagnostics?: Array<{
    filePath: string
    message: string
  }>
  sourceFiles?: {
    providers?: Record<string, string>
    routes?: {
      defaultModel?: string
      visionModel?: string
      modes?: Record<string, string>
      agents?: Record<string, string>
    }
    indexing?: string
  }
}

type ProviderConfigLoadResult = LoadedProviderConfig

const emptyProviderConfig = (): ProviderConfigFile => ({
  providers: {},
  defaultModel: undefined,
  defaultReasoningEffort: undefined,
  visionModel: undefined,
  visionReasoningEffort: undefined,
  modes: {},
  modeReasoningEfforts: {},
  agents: {},
  agentReasoningEfforts: {},
  indexing: {
    enabled: true,
    cacheDir: '.codebuff-index',
    exclude: [],
    semantic: {
      enabled: false,
      model: undefined,
    },
  },
  fileChangeHooks: [],
  autoFileChangeHooks: undefined,
  approvalMode: 'balanced',
  failoverModels: undefined,
  maxAgentSteps: undefined,
})

function normalizeConfigFragmentPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function resolveConfigFragmentPath(
  configPath: string,
  fragmentPath: string,
): string {
  return path.isAbsolute(fragmentPath)
    ? fragmentPath
    : path.resolve(path.dirname(configPath), fragmentPath)
}

function expandFragmentPaths(
  resolvedConfigPath: string,
  fragmentPaths: string[],
): string[] {
  const expanded: string[] = []
  for (const fragmentPath of fragmentPaths) {
    const resolvedPath = resolveConfigFragmentPath(
      resolvedConfigPath,
      fragmentPath,
    )
    if (!fs.existsSync(resolvedPath)) {
      continue
    }
    const stat = fs.statSync(resolvedPath)
    if (stat.isDirectory()) {
      const files = fs
        .readdirSync(resolvedPath)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => path.join(resolvedPath, file))
      expanded.push(...files)
    } else {
      expanded.push(resolvedPath)
    }
  }
  return expanded
}

function getSourceFilesFromRawConfig(
  rawConfig: any,
  resolvedConfigPath: string,
): NonNullable<LoadedProviderConfig['sourceFiles']> {
  const sourceFiles: NonNullable<LoadedProviderConfig['sourceFiles']> = {
    providers: {},
    routes: {
      modes: {},
      agents: {},
    },
  }

  const providers = {
    ...(rawConfig?.provider ?? {}),
    ...(rawConfig?.providers ?? {}),
  }
  for (const providerId of Object.keys(providers)) {
    sourceFiles.providers![providerId] = resolvedConfigPath
  }

  if (
    rawConfig?.defaultModel !== undefined ||
    rawConfig?.defaultReasoningEffort !== undefined
  ) {
    sourceFiles.routes!.defaultModel = resolvedConfigPath
  }
  if (
    rawConfig?.visionModel !== undefined ||
    rawConfig?.visionReasoningEffort !== undefined
  ) {
    sourceFiles.routes!.visionModel = resolvedConfigPath
  }

  if (rawConfig?.modes) {
    for (const mode of Object.keys(rawConfig.modes)) {
      sourceFiles.routes!.modes![mode] = resolvedConfigPath
    }
  }
  if (rawConfig?.modeReasoningEfforts) {
    for (const mode of Object.keys(rawConfig.modeReasoningEfforts)) {
      sourceFiles.routes!.modes![mode] = resolvedConfigPath
    }
  }

  if (rawConfig?.agents) {
    for (const agentId of Object.keys(rawConfig.agents)) {
      sourceFiles.routes!.agents![agentId] = resolvedConfigPath
    }
  }
  if (rawConfig?.agentReasoningEfforts) {
    for (const agentId of Object.keys(rawConfig.agentReasoningEfforts)) {
      sourceFiles.routes!.agents![agentId] = resolvedConfigPath
    }
  }

  if (rawConfig?.indexing !== undefined) {
    sourceFiles.indexing = resolvedConfigPath
  }

  return sourceFiles
}

function mergeSourceFiles(
  base: NonNullable<LoadedProviderConfig['sourceFiles']>,
  override: NonNullable<LoadedProviderConfig['sourceFiles']>,
): NonNullable<LoadedProviderConfig['sourceFiles']> {
  return {
    providers: {
      ...base.providers,
      ...override.providers,
    },
    routes: {
      defaultModel: override.routes?.defaultModel ?? base.routes?.defaultModel,
      visionModel: override.routes?.visionModel ?? base.routes?.visionModel,
      modes: {
        ...(base.routes?.modes ?? {}),
        ...(override.routes?.modes ?? {}),
      },
      agents: {
        ...(base.routes?.agents ?? {}),
        ...(override.routes?.agents ?? {}),
      },
    },
    indexing: override.indexing ?? base.indexing,
  }
}

function readProviderConfigFile(
  configPath: string,
  state: {
    stack: Set<string>
    cache: Map<string, ProviderConfigLoadResult>
  } = { stack: new Set(), cache: new Map() },
): ProviderConfigLoadResult {
  const resolvedConfigPath = path.resolve(configPath)
  const cached = state.cache.get(resolvedConfigPath)
  if (cached) return cached
  if (state.stack.has(resolvedConfigPath)) {
    throw new Error(
      `Provider config includes form a cycle at ${resolvedConfigPath}`,
    )
  }

  state.stack.add(resolvedConfigPath)
  try {
    const rawConfig = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'))
    const fragmentPaths = [
      ...normalizeConfigFragmentPaths(rawConfig?.extends),
      ...normalizeConfigFragmentPaths(rawConfig?.include),
      ...normalizeConfigFragmentPaths(rawConfig?.includes),
    ]

    // Automatically look for openbuff.d next to any config file (like openbuff.json)
    const configDir = path.dirname(resolvedConfigPath)
    const implicitDir = path.join(configDir, 'openbuff.d')
    if (fs.existsSync(implicitDir) && fs.statSync(implicitDir).isDirectory()) {
      if (
        !fragmentPaths.includes('openbuff.d') &&
        !fragmentPaths.includes('./openbuff.d')
      ) {
        fragmentPaths.push('openbuff.d')
      }
    }

    const expandedPaths = expandFragmentPaths(resolvedConfigPath, fragmentPaths)

    let config = emptyProviderConfig()
    const sourceFilePaths: string[] = []
    let sourceFiles: NonNullable<LoadedProviderConfig['sourceFiles']> = {
      providers: {},
      routes: {
        modes: {},
        agents: {},
      },
    }

    for (const resolvedPath of expandedPaths) {
      const loadedFragment = readProviderConfigFile(resolvedPath, state)
      config = mergeProviderConfigs(config, loadedFragment.config)
      sourceFilePaths.push(...loadedFragment.sourceFilePaths)
      sourceFiles = mergeSourceFiles(
        sourceFiles,
        loadedFragment.sourceFiles ?? {},
      )
    }

    const parseResult = providerConfigFileSchema.safeParse(rawConfig)
    if (!parseResult.success) {
      throw new Error(
        `Invalid provider config at ${resolvedConfigPath}: ${parseResult.error.message}`,
      )
    }
    config = mergeProviderConfigs(config, parseResult.data)

    const currentSourceFiles = getSourceFilesFromRawConfig(
      rawConfig,
      resolvedConfigPath,
    )
    sourceFiles = mergeSourceFiles(sourceFiles, currentSourceFiles)

    const result = {
      config,
      sourceFilePaths: Array.from(
        new Set([...sourceFilePaths, resolvedConfigPath]),
      ),
      sourceFiles,
    }
    state.cache.set(resolvedConfigPath, result)
    return result
  } finally {
    state.stack.delete(resolvedConfigPath)
  }
}

export function mergeFileChangeHooks(
  base: FileChangeHook[] | undefined,
  override: FileChangeHook[] | undefined,
): FileChangeHook[] {
  const baseHooks = base ?? []
  const overrideHooks = override ?? []
  if (baseHooks.length === 0 && overrideHooks.length === 0) return []

  // Identity: command + filePattern + name. Override entries win on conflict.
  // Ordering: base entries that are not overridden come first, in their
  // original order, followed by override-only entries in override order. An
  // override entry that collides with a base entry replaces the base entry but
  // retains the base entry's position (so a project can tune a global hook
  // without reordering the hook set).
  const hookKey = (hook: FileChangeHook): string =>
    `${hook.command}\u0000${hook.filePattern ?? ''}\u0000${hook.name ?? ''}`

  const overrideByKey = new Map<string, FileChangeHook>()
  for (const hook of overrideHooks) {
    overrideByKey.set(hookKey(hook), hook)
  }

  const seenKeys = new Set<string>()
  const merged: FileChangeHook[] = []
  for (const hook of baseHooks) {
    const key = hookKey(hook)
    if (seenKeys.has(key)) continue // dedup within base
    seenKeys.add(key)
    // Override wins on conflict but keeps the base entry's slot.
    merged.push(overrideByKey.get(key) ?? hook)
  }
  // Append override-only entries (those not matching any base entry).
  for (const [key, hook] of overrideByKey) {
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      merged.push(hook)
    }
  }
  return merged
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
    visionModel: override.visionModel ?? base.visionModel,
    visionReasoningEffort:
      override.visionReasoningEffort ?? base.visionReasoningEffort,
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
    indexing: override.indexing ?? base.indexing,
    fileChangeHooks: mergeFileChangeHooks(
      base.fileChangeHooks,
      override.fileChangeHooks,
    ),
    autoFileChangeHooks:
      override.autoFileChangeHooks ?? base.autoFileChangeHooks,
    approvalMode: override.approvalMode ?? base.approvalMode,
    failoverModels: override.failoverModels ?? base.failoverModels,
    maxAgentSteps: override.maxAgentSteps ?? base.maxAgentSteps,
  }
}

function getOpenbuffConfigDirs(): string[] {
  return [getConfigDir()]
}

function getDefaultProviderConfigPaths(): string[] {
  return [
    ...getOpenbuffConfigDirs().flatMap((configDir) => [
      path.join(configDir, GLOBAL_PROVIDER_CONFIG_FILE_NAME),
      path.join(configDir, PROVIDER_CONFIG_FILE_NAME),
    ]),
    ...getAncestorProviderConfigPaths(process.cwd()),
  ]
}

export function getAncestorProviderConfigPaths(startDir: string): string[] {
  const paths: string[] = []
  let currentDir = path.resolve(startDir)

  // Security bound: never walk above the user's home directory. A config file
  // placed in a non-project ancestor (e.g. `/tmp/openbuff.json`, `/etc/...`)
  // can route API requests to attacker-controlled endpoints and leak secrets
  // sourced from apiKeyEnv. Legitimate monorepo configs live at the workspace
  // root, which is always below home, so this bound preserves real use cases
  // while closing the unbounded-to-filesystem-root walk.
  const home = os.homedir()
  const trustAncestorConfig =
    (getSystemProcessEnv().OPENBUFF_TRUST_ANCESTOR_CONFIG ?? '') === '1'
  const depthCeiling = trustAncestorConfig
    ? Number.MAX_SAFE_INTEGER
    : MAX_ANCESTOR_SCAN_DEPTH

  for (let depth = 0; depth < depthCeiling; depth++) {
    paths.push(path.join(currentDir, PROVIDER_CONFIG_FILE_NAME))

    // Stop at the home directory boundary unless the user has opted into the
    // old unbounded behavior.
    if (!trustAncestorConfig && currentDir === home) {
      return paths
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      return paths
    }
    currentDir = parentDir
  }

  return paths
}

/**
 * Warn when a provider that sources its API key from an env var was loaded
 * from a config file outside the project root. An ancestor `openbuff.json`
 * with an `apiKeyEnv` provider can route requests to attacker-controlled
 * endpoints and exfiltrate the env-var secret. The bounded ancestor walk in
 * getAncestorProviderConfigPaths prevents loading from far ancestors; this
 * warning surfaces the remaining case where a config above the project (but
 * within the home boundary) carries an apiKeyEnv provider.
 */
function warnIfAncestorConfigHasApiKeyEnv(
  config: ProviderConfigFile,
  sourceFilePaths: string[],
  cwd: string,
): void {
  const projectRoot = path.resolve(cwd)
  const ancestorPaths = sourceFilePaths.filter((p) => {
    const resolved = path.resolve(p)
    return (
      resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)
    )
  })
  if (ancestorPaths.length === 0) {
    return
  }

  for (const provider of Object.values(config.providers ?? {})) {
    if (
      provider &&
      typeof provider === 'object' &&
      'apiKeyEnv' in provider &&
      provider.apiKeyEnv
    ) {
      console.warn(
        `[openbuff] A provider config loaded from a non-project ancestor ` +
          `(${ancestorPaths.join(', ')}) declares an apiKeyEnv provider. ` +
          `An ancestor config can route API requests to untrusted endpoints ` +
          `and leak secrets sourced from env vars. ` +
          `Set OPENBUFF_TRUST_ANCESTOR_CONFIG=1 to acknowledge and suppress this warning.`,
      )
      return
    }
  }
}

// ----------------------------------------------------------------------------
// Module-scope cache for loadProviderConfigSync (C2.2).
//
// loadProviderConfigSync() is on the hot path — called on every LLM request
// via getModelForRequest, plus by file-change-hooks, model-discovery, and the
// CLI. Each call re-reads and re-parses every provider config file from disk.
// This cache memoizes the parsed result keyed on the resolved config file
// paths AND their mtimes, so live edits to openbuff.json (e.g. via
// writeProviderConfigFile, which uses writeFileSync and bumps mtime) cleanly
// invalidate the cache without a manual bust. The explicit env-var override
// is part of the key so toggling OPENBUFF_PROVIDER_CONFIG forces a re-read.
// ----------------------------------------------------------------------------
interface ProviderConfigCacheEntry {
  key: string
  config: LoadedProviderConfig
}

let providerConfigCache: ProviderConfigCacheEntry | null = null

function addProviderConfigDependencyPath(
  paths: string[],
  seen: Set<string>,
  dependencyPath: string,
): void {
  const resolvedPath = path.resolve(dependencyPath)
  if (seen.has(resolvedPath)) return
  seen.add(resolvedPath)
  paths.push(resolvedPath)
}

function collectProviderConfigDependencyPaths(
  configPath: string,
  state: {
    stack: Set<string>
    paths: string[]
    seen: Set<string>
  } = { stack: new Set(), paths: [], seen: new Set() },
): string[] {
  const resolvedConfigPath = path.resolve(configPath)
  addProviderConfigDependencyPath(state.paths, state.seen, resolvedConfigPath)

  if (
    state.stack.has(resolvedConfigPath) ||
    !fs.existsSync(resolvedConfigPath)
  ) {
    return state.paths
  }

  let rawConfig: any
  try {
    rawConfig = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'))
  } catch {
    return state.paths
  }

  state.stack.add(resolvedConfigPath)
  try {
    const fragmentPaths = [
      ...normalizeConfigFragmentPaths(rawConfig?.extends),
      ...normalizeConfigFragmentPaths(rawConfig?.include),
      ...normalizeConfigFragmentPaths(rawConfig?.includes),
    ]

    const configDir = path.dirname(resolvedConfigPath)
    const implicitDir = path.join(configDir, 'openbuff.d')
    addProviderConfigDependencyPath(state.paths, state.seen, implicitDir)
    if (
      fs.existsSync(implicitDir) &&
      fs.statSync(implicitDir).isDirectory() &&
      !fragmentPaths.includes('openbuff.d') &&
      !fragmentPaths.includes('./openbuff.d')
    ) {
      fragmentPaths.push('openbuff.d')
    }

    for (const fragmentPath of fragmentPaths) {
      const resolvedPath = resolveConfigFragmentPath(
        resolvedConfigPath,
        fragmentPath,
      )
      addProviderConfigDependencyPath(state.paths, state.seen, resolvedPath)
      if (!fs.existsSync(resolvedPath)) continue

      const stat = fs.statSync(resolvedPath)
      if (stat.isDirectory()) {
        for (const file of fs
          .readdirSync(resolvedPath)
          .filter((file) => file.endsWith('.json'))
          .sort()) {
          collectProviderConfigDependencyPaths(
            path.join(resolvedPath, file),
            state,
          )
        }
      } else {
        collectProviderConfigDependencyPaths(resolvedPath, state)
      }
    }
  } finally {
    state.stack.delete(resolvedConfigPath)
  }
  return state.paths
}

/**
 * Build a cache key that changes whenever the set of resolved config paths,
 * expanded fragment paths/directories, any of their mtimes, or the explicit
 * env-var override changes. Missing files/directories contribute a sentinel so
 * that newly-created configs or openbuff.d fragments invalidate the cache.
 */
function buildProviderConfigCacheKey(
  configPaths: string[],
  explicitConfigPath: string | undefined,
): string {
  const parts: string[] = explicitConfigPath
    ? [`env=${explicitConfigPath}`]
    : []
  const dependencyPaths: string[] = []
  const seen = new Set<string>()
  for (const configPath of configPaths) {
    for (const dependencyPath of collectProviderConfigDependencyPaths(
      configPath,
    )) {
      addProviderConfigDependencyPath(dependencyPaths, seen, dependencyPath)
    }
  }

  for (const dependencyPath of dependencyPaths) {
    let mtime: string
    try {
      const stat = fs.statSync(dependencyPath)
      mtime = `${stat.mtimeMs}:${stat.size}`
    } catch {
      mtime = 'missing'
    }
    parts.push(`${dependencyPath}:${mtime}`)
  }
  return parts.join('|')
}

/**
 * Clear the module-scope provider config cache. Intended for tests that swap
 * HOME/cwd or manipulate config files in ways not visible to mtime (rare).
 * Production callers never need this — mtime invalidation handles live edits.
 */
export function clearProviderConfigCacheForTest(): void {
  providerConfigCache = null
}

export function loadProviderConfigSync(
  params: { env?: NodeJS.ProcessEnv } = {},
): LoadedProviderConfig {
  const env = params.env ?? getSystemProcessEnv()
  const explicitConfigPath = env[PROVIDER_CONFIG_ENV_VAR]
  const configPaths = explicitConfigPath
    ? [explicitConfigPath]
    : getDefaultProviderConfigPaths()

  // Fast path: return the memoized config if no underlying file changed.
  const cacheKey = buildProviderConfigCacheKey(configPaths, explicitConfigPath)
  if (providerConfigCache && providerConfigCache.key === cacheKey) {
    return providerConfigCache.config
  }

  let config = emptyProviderConfig()
  const sourceFilePaths: string[] = []
  const diagnostics: NonNullable<LoadedProviderConfig['diagnostics']> = []
  let sourceFiles: NonNullable<LoadedProviderConfig['sourceFiles']> = {
    providers: {},
    routes: {
      modes: {},
      agents: {},
    },
  }

  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) {
      continue
    }

    try {
      const parsedConfig = readProviderConfigFile(configPath)
      config = mergeProviderConfigs(config, parsedConfig.config)
      sourceFilePaths.push(...parsedConfig.sourceFilePaths)
      sourceFiles = mergeSourceFiles(
        sourceFiles,
        parsedConfig.sourceFiles ?? {},
      )
    } catch (error) {
      if (explicitConfigPath) {
        throw error
      }
      diagnostics.push({
        filePath: configPath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  warnIfAncestorConfigHasApiKeyEnv(config, sourceFilePaths, process.cwd())

  if (!hasLoggedConfigPaths) {
    hasLoggedConfigPaths = true
    if (sourceFilePaths.length > 0) {
      console.info(
        `[openbuff] Loaded provider config from:\n  - ${sourceFilePaths.join('\n  - ')}`,
      )
    }
  }

  const result: LoadedProviderConfig = {
    config,
    sourceFilePaths,
    sourceFiles,
    diagnostics,
  }
  providerConfigCache = { key: cacheKey, config: result }
  return result
}

let hasLoggedConfigPaths = false

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
    merged.input = mergeDefined(merged.input, capability.input)
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

  // Capability resolution uses only explicit metadata: the provider-level
  // defaultCapabilities followed by per-model modelCapabilities overrides.
  // Legacy inference from contextWindowTokens / compatibility.* was removed so
  // that routes.json is the single source of truth — configs must declare
  // capabilities explicitly via defaultCapabilities / modelCapabilities.
  return compactCapability(
    mergeModelCapabilities(
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
  if (capabilities.input?.image) {
    parts.push('image input')
  }
  if (capabilities.input?.file) {
    parts.push('file input')
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
  plan: ['base-plan', 'base2-plan'],
  executePlan: ['base-execute-plan', 'base2-execute-plan'],
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

export type CodingRoutingContext = {
  language?: string
  taskType?: string
  agentRole?: string
}

export type EmpiricalModelRecommendation = {
  model: string
  score: number
  sampleSize?: number
  benchmark?: string
  matchedContext: CodingRoutingContext
}

/**
 * Opt-in recommendation layer. This deliberately does not participate in
 * resolveConfiguredAgentModelConfig, so explicit mode/agent/default routes
 * remain authoritative. Models without a matching measurement are excluded.
 */
export function recommendConfiguredModel(params: {
  context: CodingRoutingContext
  loadedConfig?: LoadedProviderConfig
}): EmpiricalModelRecommendation | undefined {
  const { context, loadedConfig = loadProviderConfigSync() } = params
  const recommendations: EmpiricalModelRecommendation[] = []

  for (const [providerId, provider] of Object.entries(
    loadedConfig.config.providers,
  )) {
    const models = Array.isArray(provider.models)
      ? provider.models
      : Object.keys(provider.models)
    for (const model of models) {
      const capabilities = resolveModelCapabilities({
        providerId,
        model,
        loadedConfig,
      })
      const matches = (capabilities.quality?.coding ?? []).filter(
        (measurement) =>
          (!measurement.language ||
            measurement.language === context.language) &&
          (!measurement.taskType ||
            measurement.taskType === context.taskType) &&
          (!measurement.agentRole ||
            measurement.agentRole === context.agentRole),
      )
      if (matches.length === 0) continue
      matches.sort((a, b) => {
        const specificity = (value: typeof a) =>
          Number(Boolean(value.language)) +
          Number(Boolean(value.taskType)) +
          Number(Boolean(value.agentRole))
        return specificity(b) - specificity(a) || b.score - a.score
      })
      const best = matches[0]!
      recommendations.push({
        model: `${providerId}/${model}`,
        score: best.score,
        sampleSize: best.sampleSize,
        benchmark: best.benchmark,
        matchedContext: {
          language: best.language,
          taskType: best.taskType,
          agentRole: best.agentRole,
        },
      })
    }
  }

  return recommendations.sort(
    (a, b) =>
      b.score - a.score ||
      Object.values(b.matchedContext).filter(Boolean).length -
        Object.values(a.matchedContext).filter(Boolean).length ||
      (b.sampleSize ?? 0) - (a.sampleSize ?? 0),
  )[0]
}

export function resolveConfiguredAgentModelConfig(params: {
  agentId?: string
  model?: string
  loadedConfig?: LoadedProviderConfig
  /**
   * When true, an explicit `model` param wins over mode/agent/defaultModel
   * routing. Used by the provider-failover loop so each configured
   * `failoverModels` entry is actually attempted instead of being silently
   * re-resolved to the same primary model via openbuff.json routing (M8.1).
   * Mode/agent/defaultModel routing still applies when `model` is omitted.
   */
  preferModelParam?: boolean
}): ResolvedAgentModelConfig {
  const {
    agentId,
    model,
    loadedConfig = loadProviderConfigSync(),
    preferModelParam = false,
  } = params
  const agentModels = loadedConfig.config.agents ?? {}
  const agentReasoningEfforts = loadedConfig.config.agentReasoningEfforts ?? {}

  // Failover path: an explicit model param wins over routing so each
  // configured failover model is actually attempted. Reasoning effort still
  // resolves from matching route entries so per-model effort overrides apply.
  if (preferModelParam && model) {
    const mode = resolveModeForAgentId(agentId)
    const reasoningEffort =
      (mode && loadedConfig.config.modeReasoningEfforts?.[mode]) ??
      normalizeAgentIdCandidates(agentId)
        .map((candidate) => agentReasoningEfforts[candidate])
        .find((effort) => effort !== undefined) ??
      loadedConfig.config.defaultReasoningEffort
    return { model, reasoningEffort }
  }

  // Mode/agent/defaultModel routing in openbuff.json takes precedence. The
  // `model` param is used as a last-resort fallback so callers that pass an
  // explicit routable model id (e.g. getModelForRequest with no agent config)
  // still resolve successfully.
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

  if (loadedConfig.config.defaultModel) {
    return {
      model: loadedConfig.config.defaultModel,
      reasoningEffort: loadedConfig.config.defaultReasoningEffort,
    }
  }

  if (model) {
    return { model }
  }

  throw new Error(
    `No model configured for agent '${agentId ?? 'unknown'}'. ` +
      `Run /setup or set defaultModel (or agents['${agentId ?? 'unknown'}']) in your openbuff.json.`,
  )
}

export function resolveConfiguredAgentModel(params: {
  agentId?: string
  model?: string
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
  const loadedConfig = params.loadedConfig ?? loadProviderConfigSync({ env })

  for (const [providerId, provider] of Object.entries(
    loadedConfig.config.providers,
  )) {
    const providerModel = getModelMapping(providerId, model, provider)
    if (providerModel === undefined) {
      continue
    }

    const providerHasApiKeyEnv =
      provider.type === 'openai-compatible' ||
      provider.type === 'anthropic-compatible'
    const apiKey =
      providerHasApiKeyEnv && provider.apiKeyEnv
        ? env[provider.apiKeyEnv]
        : undefined
    if (providerHasApiKeyEnv && provider.apiKeyEnv && !apiKey) {
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

export function resolveContextWindowTokens(params: {
  agentId?: string
  model?: string
  loadedConfig?: LoadedProviderConfig
}): number | undefined {
  const { agentId, model, loadedConfig = loadProviderConfigSync() } = params
  const effectiveModel = resolveConfiguredAgentModelConfig({
    agentId,
    model,
    loadedConfig,
  }).model
  const configuredProviderModel = resolveConfiguredProviderModel({
    model: effectiveModel,
    loadedConfig,
  })

  if (!configuredProviderModel) {
    return undefined
  }

  return resolveModelCapabilities({
    providerId: configuredProviderModel.providerId,
    model: effectiveModel,
    loadedConfig,
  }).context?.windowTokens
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
        plan: 'opencode-go/glm-5.1',
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
            supportsStopSequences: false,
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
      'OpenAI Chat Completions-compatible route using GPT-5.5 for coding.',
    envHelp: 'export OPENAI_API_KEY="your_openai_api_key"',
    config: {
      defaultModel: 'openai/gpt-5.5',
      modes: {
        default: 'openai/gpt-5.5',
        plan: 'openai/gpt-5.5',
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
        plan: 'codex/gpt-5.5',
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
    description: 'OpenRouter with Claude Sonnet for primary work and planning.',
    envHelp: 'export OPENROUTER_API_KEY="your_openrouter_api_key"',
    config: {
      defaultModel: 'openrouter/anthropic/claude-sonnet-4.5',
      modes: {
        default: 'openrouter/anthropic/claude-sonnet-4.5',
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
        plan: 'bedrock/apac.anthropic.claude-sonnet-4-6',
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
      'Free Model endpoints for GPT and Claude-compatible coding models, with gpt-5.5 for coding.',
    envHelp: 'export FREEMODEL_API_KEY="your_freemodel_api_key"',
    config: {
      defaultModel: 'freemodel/gpt-5.5',
      modes: {
        default: 'freemodel/gpt-5.5',
        plan: 'freemodel/gpt-5.5',
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
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic API',
    description:
      'Native Anthropic Messages API. Works with api.anthropic.com or a compatible gateway (set baseURL, e.g. https://cc.freemodel.dev). Enables real prompt caching.',
    envHelp: 'export ANTHROPIC_API_KEY="your_anthropic_api_key"',
    config: {
      defaultModel: 'anthropic/claude-sonnet-4-5',
      modes: {
        default: 'anthropic/claude-sonnet-4-5',
        plan: 'anthropic/claude-sonnet-4-5',
      },
      providers: {
        anthropic: {
          type: 'anthropic-compatible',
          baseURL: 'https://api.anthropic.com',
          apiKeyEnv: 'ANTHROPIC_API_KEY',
          models: [
            'claude-opus-4-5',
            'claude-sonnet-4-5',
            'claude-haiku-4-5',
            'claude-opus-4-1',
            'claude-sonnet-4-0',
          ],
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
  const presetConfig: ProviderConfigFileInput = preset.config
  const defaultModel = presetConfig.defaultModel
  const highReasoningAgents = [
    'repair-editor',
    'architect',
    'product-reviewer',
    'integration-agent',
    'performance-specialist',
    'reliability-reviewer',
    'migration-reviewer',
    'accessibility-reviewer',
    'ux-visual-reviewer',
    'compatibility-reviewer',
    'dependency-reviewer',
    'incident-coordinator',
    'release-manager',
    'docs-architect',
    'evaluator',
  ] as const
  const defaultRoutedAgents = [
    ...highReasoningAgents,
    'dependency-manager',
  ] as const
  const seededAgents = Object.fromEntries(
    defaultRoutedAgents.map((agentId) => [
      agentId,
      presetConfig.agents?.[agentId] ?? defaultModel!,
    ]),
  )
  const seededReasoning = Object.fromEntries(
    highReasoningAgents.map((agentId) => [
      agentId,
      presetConfig.agentReasoningEfforts?.[agentId] ?? 'high',
    ]),
  )
  const config: ProviderConfigFileInput = {
    ...presetConfig,
    ...(defaultModel
      ? {
          agents: {
            ...(presetConfig.agents ?? {}),
            ...seededAgents,
          },
          agentReasoningEfforts: {
            ...(presetConfig.agentReasoningEfforts ?? {}),
            ...seededReasoning,
          },
        }
      : {}),
  }
  const parseResult = providerConfigFileSchema.safeParse(config)
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

function tryWriteFragmentedConfig(
  rootPath: string,
  newConfig: ProviderConfigFileInput,
): boolean {
  if (!fs.existsSync(rootPath)) return false
  let rawRoot: Record<string, any>
  try {
    rawRoot = JSON.parse(fs.readFileSync(rootPath, 'utf8'))
  } catch {
    return false
  }
  const fragmentPaths = [
    ...normalizeConfigFragmentPaths(rawRoot?.extends),
    ...normalizeConfigFragmentPaths(rawRoot?.include),
    ...normalizeConfigFragmentPaths(rawRoot?.includes),
  ]
  const rootDir = path.dirname(rootPath)
  const implicitDir = path.join(rootDir, 'openbuff.d')
  if (fs.existsSync(implicitDir) && fs.statSync(implicitDir).isDirectory()) {
    if (
      !fragmentPaths.includes('openbuff.d') &&
      !fragmentPaths.includes('./openbuff.d')
    ) {
      fragmentPaths.push('openbuff.d')
    }
  }

  if (fragmentPaths.length === 0) return false

  // Resolve and expand all fragment paths (including directory contents)
  const expandedPaths = expandFragmentPaths(rootPath, fragmentPaths)
  if (expandedPaths.length === 0) return false

  const parsedFragments = new Map<string, any>()
  const keyToPathMap = new Map<string, string>()

  for (const resolvedFragmentPath of expandedPaths) {
    if (fs.existsSync(resolvedFragmentPath)) {
      const rawFragment = JSON.parse(
        fs.readFileSync(resolvedFragmentPath, 'utf8'),
      )
      parsedFragments.set(resolvedFragmentPath, rawFragment)
      for (const key of Object.keys(rawFragment)) {
        keyToPathMap.set(key, resolvedFragmentPath)
      }
    }
  }

  // Default target paths based on name heuristics or key maps
  const providersPath =
    [...parsedFragments.keys()].find(
      (p) =>
        p.endsWith('providers.json') ||
        p.endsWith('provider.json') ||
        keyToPathMap.has('providers') ||
        keyToPathMap.has('provider'),
    ) ??
    expandedPaths.find(
      (p) => p.endsWith('providers.json') || p.endsWith('provider.json'),
    )

  const routesPath =
    [...parsedFragments.keys()].find(
      (p) =>
        p.endsWith('routes.json') ||
        keyToPathMap.has('modes') ||
        keyToPathMap.has('defaultModel') ||
        keyToPathMap.has('visionModel') ||
        keyToPathMap.has('agents'),
    ) ?? expandedPaths.find((p) => p.endsWith('routes.json'))

  const indexingPath =
    [...parsedFragments.keys()].find(
      (p) => p.endsWith('indexing.json') || keyToPathMap.has('indexing'),
    ) ?? expandedPaths.find((p) => p.endsWith('indexing.json'))

  const fragmentPayloads = new Map<string, Record<string, any>>()
  const getPayload = (resolvedPath: string): Record<string, any> => {
    const payload = fragmentPayloads.get(resolvedPath)
    if (!payload) {
      const newPayload = { ...(parsedFragments.get(resolvedPath) ?? {}) }
      fragmentPayloads.set(resolvedPath, newPayload)
      return newPayload
    }
    return payload
  }

  const routeKey = (
    key: string,
    value: any,
    fallbackPath: string | undefined,
  ) => {
    if (value === undefined) return
    const targetPath = keyToPathMap.get(key) ?? fallbackPath
    if (targetPath) {
      const payload = getPayload(targetPath)
      payload[key] = value
    } else {
      rawRoot[key] = value
    }
  }

  if (newConfig.providers !== undefined) {
    routeKey('providers', newConfig.providers, providersPath)
  }
  if (newConfig.provider !== undefined) {
    routeKey('provider', newConfig.provider, providersPath)
  }
  if (newConfig.indexing !== undefined) {
    routeKey('indexing', newConfig.indexing, indexingPath)
  }

  const routingKeys = [
    'defaultModel',
    'defaultReasoningEffort',
    'visionModel',
    'visionReasoningEffort',
    'modes',
    'modeReasoningEfforts',
    'agents',
    'agentReasoningEfforts',
  ]
  for (const key of routingKeys) {
    if ((newConfig as any)[key] !== undefined) {
      routeKey(key, (newConfig as any)[key], routesPath)
    }
  }

  // Remove key-value routing fields from the root config so they are not duplicated
  for (const key of ['providers', 'provider', 'indexing', ...routingKeys]) {
    if (
      keyToPathMap.has(key) ||
      (key === 'providers' && providersPath) ||
      (key === 'provider' && providersPath) ||
      (key === 'indexing' && indexingPath) ||
      (routingKeys.includes(key) && routesPath)
    ) {
      delete rawRoot[key]
    }
  }

  const transaction = new Map<string, unknown>(fragmentPayloads)
  transaction.set(rootPath, rawRoot)
  writeJsonFilesTransaction(transaction)
  return true
}

function writeJsonFilesTransaction(files: Map<string, unknown>): void {
  const transactionId = `${process.pid}.${Date.now()}`
  const staged = [...files].map(([filePath, value], index) => {
    const parentDir = path.dirname(filePath)
    fs.mkdirSync(parentDir, { recursive: true })
    fs.accessSync(parentDir, fs.constants.W_OK)
    const existed = fs.existsSync(filePath)
    if (existed) {
      if (!fs.statSync(filePath).isFile()) {
        throw new Error(
          `Provider config transaction target is not a file: ${filePath}`,
        )
      }
      fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK)
    }
    return {
      filePath,
      existed,
      tempPath: `${filePath}.tmp.${transactionId}.${index}`,
      backupPath: `${filePath}.bak.${transactionId}.${index}`,
      serialized: JSON.stringify(value, null, 2) + '\n',
      backupCreated: false,
      installed: false,
    }
  })

  try {
    for (const item of staged) {
      fs.writeFileSync(item.tempPath, item.serialized, { mode: 0o600 })
    }

    for (const item of staged) {
      if (item.existed) {
        fs.renameSync(item.filePath, item.backupPath)
        item.backupCreated = true
      }
      fs.renameSync(item.tempPath, item.filePath)
      item.installed = true
    }

    for (const item of staged) {
      if (fs.existsSync(item.backupPath)) fs.unlinkSync(item.backupPath)
    }
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const item of [...staged].reverse()) {
      try {
        if (item.installed && fs.existsSync(item.filePath)) {
          fs.unlinkSync(item.filePath)
        }
        if (item.backupCreated && fs.existsSync(item.backupPath)) {
          fs.renameSync(item.backupPath, item.filePath)
        }
      } catch (rollbackError) {
        rollbackErrors.push(
          `${item.filePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        )
      }
    }
    const rollbackSuffix = rollbackErrors.length
      ? ` Rollback errors: ${rollbackErrors.join('; ')}`
      : ''
    throw new Error(
      `Failed to commit fragmented provider config transaction: ${error instanceof Error ? error.message : String(error)}.${rollbackSuffix}`,
    )
  } finally {
    for (const item of staged) {
      for (const cleanupPath of [item.tempPath, item.backupPath]) {
        try {
          if (fs.existsSync(cleanupPath)) fs.unlinkSync(cleanupPath)
        } catch {
          // Best-effort cleanup after commit or rollback.
        }
      }
    }
  }
}

function writeJsonFileAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  })
  try {
    fs.renameSync(tempPath, filePath)
  } catch (error) {
    if (
      !['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')
    ) {
      throw error
    }
    fs.unlinkSync(filePath)
    fs.renameSync(tempPath, filePath)
  }
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
      existingConfig = readProviderConfigFile(configPath).config
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
      visionModel: existingConfig.visionModel ?? newConfig.visionModel,
      visionReasoningEffort:
        existingConfig.visionReasoningEffort ?? newConfig.visionReasoningEffort,
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
      indexing: existingConfig.indexing ?? newConfig.indexing,
      fileChangeHooks: existingConfig.fileChangeHooks?.length
        ? existingConfig.fileChangeHooks
        : newConfig.fileChangeHooks,
      autoFileChangeHooks:
        existingConfig.autoFileChangeHooks ?? newConfig.autoFileChangeHooks,
      failoverModels: existingConfig.failoverModels ?? newConfig.failoverModels,
      maxAgentSteps: existingConfig.maxAgentSteps ?? newConfig.maxAgentSteps,
    }

    if (tryWriteFragmentedConfig(configPath, mergedConfig)) {
      return configPath
    }

    writeJsonFileAtomic(configPath, mergedConfig)
    return configPath
  }

  if (tryWriteFragmentedConfig(configPath, newConfig)) {
    return configPath
  }

  writeJsonFileAtomic(configPath, newConfig)
  return configPath
}

export function getMissingProviderEnvVars(
  params: {
    loadedConfig?: LoadedProviderConfig
    env?: NodeJS.ProcessEnv
  } = {},
): string[] {
  const env = params.env ?? getSystemProcessEnv()
  const loadedConfig = params.loadedConfig ?? loadProviderConfigSync({ env })
  const missing = new Set<string>()
  for (const provider of Object.values(loadedConfig.config.providers)) {
    if (
      (provider.type === 'openai-compatible' ||
        provider.type === 'anthropic-compatible') &&
      provider.apiKeyEnv &&
      !env[provider.apiKeyEnv]
    ) {
      missing.add(provider.apiKeyEnv)
    }
  }
  return Array.from(missing).sort()
}

function getRelativeConfigPath(filePath: string): string {
  try {
    return path.relative(process.cwd(), filePath)
  } catch {
    return filePath
  }
}

export function describeLoadedProviderConfig(
  loadedConfig = loadProviderConfigSync(),
): string {
  const lines: string[] = []
  lines.push(
    `Config: ${
      loadedConfig.sourceFilePaths.length
        ? loadedConfig.sourceFilePaths.map(getRelativeConfigPath).join(', ')
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
  const providers = Object.entries(loadedConfig.config.providers)
  lines.push(`Providers: ${providers.length ? providers.length : '(none)'}`)
  for (const [providerId, provider] of providers) {
    const models = Array.isArray(provider.models)
      ? provider.models.join(', ')
      : Object.entries(provider.models)
          .map(([from, to]) => `${from}->${to}`)
          .join(', ')
    const sourceFile = loadedConfig.sourceFiles?.providers?.[providerId]
    const sourceSuffix = sourceFile
      ? ` (defined in ${getRelativeConfigPath(sourceFile)})`
      : ''
    if (provider.type === 'chatgpt-oauth') {
      lines.push(
        `- ${providerId}: ChatGPT/Codex OAuth | models=${models}${sourceSuffix}`,
      )
    } else {
      const kindSuffix =
        provider.type === 'anthropic-compatible' ? ' [anthropic]' : ''
      lines.push(
        `- ${providerId}: ${provider.baseURL} | env=${provider.apiKeyEnv ?? '(none)'} | models=${models}${kindSuffix}${sourceSuffix}`,
      )
    }
  }
  const missing = getMissingProviderEnvVars({ loadedConfig })
  if (missing.length) {
    lines.push(`Missing env: ${missing.join(', ')}`)
  }
  if (loadedConfig.diagnostics?.length) {
    lines.push('Config errors:')
    for (const diagnostic of loadedConfig.diagnostics) {
      lines.push(
        `- ${getRelativeConfigPath(diagnostic.filePath)}: ${diagnostic.message}`,
      )
    }
  }
  return lines.join('\n')
}
