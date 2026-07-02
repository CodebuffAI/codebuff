import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  loadProviderConfigSync,
  providerConfigFileSchema,
  writeProviderConfigFile,
} from './provider-config'
import { getSystemProcessEnv } from './env'

import type {
  LoadedProviderConfig,
  ModelCapabilities,
  ProviderConfig,
  ProviderConfigFileInput,
} from './provider-config'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Supported discovery strategies. */
export type ModelDiscoveryStrategy =
  | 'openai-compatible'
  | 'ollama'
  | 'openrouter'
  | 'custom'

/** Per-provider discovery settings (may be absent – auto-detected). */
export type ModelDiscoveryAuth = 'auto' | 'provider' | 'none'

export type ModelDiscoveryConfig = {
  strategy?: ModelDiscoveryStrategy
  endpoint?: string
  auth?: ModelDiscoveryAuth
  arrayPath?: string
  idPath?: string
}

/** A single model returned by a provider discovery endpoint. */
export type DiscoveredModel = {
  id: string
  name?: string
  created?: number
  capabilities?: ModelCapabilities
  raw?: unknown
}

/** Cached discovery result for one provider. */
export type ProviderModelDiscoveryResult = {
  providerId: string
  fetchedAt: string
  models: DiscoveredModel[]
}

/** Injectable fetch — avoids real network in tests. */
export type ModelDiscoveryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type DiscoverProviderModelsParams = {
  providerId: string
  loadedConfig?: LoadedProviderConfig
  env?: NodeJS.ProcessEnv
  fetch: ModelDiscoveryFetch
  signal?: AbortSignal
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const MODEL_DISCOVERY_CACHE_FILE = 'model-discovery-cache.json'
const DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS = 30_000

function getCachePath(): string {
  return path.join(
    os.homedir(),
    '.config',
    'openbuff',
    MODEL_DISCOVERY_CACHE_FILE,
  )
}

// Overridable for testing via setModelDiscoveryCachePath.
let _discoveryCachePathOverride: string | undefined

function resolveCachePath(): string {
  return _discoveryCachePathOverride ?? getCachePath()
}

/** Test-only helper to override the discovery cache path. Restores default on undefined. */
export function setModelDiscoveryCachePath(path: string | undefined): void {
  _discoveryCachePathOverride = path
}

/** Semver-safe alias for setModelDiscoveryCachePath — use in tests. */
export const setModelDiscoveryCachePathForTest = setModelDiscoveryCachePath

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getByPath(
  value: unknown,
  dottedPath: string | undefined,
): unknown {
  if (!dottedPath) return value
  return dottedPath.split('.').reduce<unknown>((current, segment) => {
    if (current == null) return undefined
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)]
    }
    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, value)
}

function normalizeEndpoint(
  provider: ProviderConfig,
  discovery: NonNullable<ModelDiscoveryConfig>,
): string {
  if (discovery.endpoint) return discovery.endpoint
  if (provider.type !== 'openai-compatible') {
    throw new Error(
      'Only OpenAI-compatible providers can infer discovery endpoints.',
    )
  }
  if (discovery.strategy === 'ollama') {
    const url = new URL(provider.baseURL)
    url.pathname = '/api/tags'
    url.search = ''
    return url.toString()
  }
  return `${provider.baseURL.replace(/\/$/, '')}/models`
}

function shouldSendAuthorizationHeader(params: {
  provider: ProviderConfig
  discovery: NonNullable<ModelDiscoveryConfig>
  endpoint: string
}): boolean {
  const auth = params.discovery.auth ?? 'auto'
  if (auth === 'none') return false
  if (auth === 'provider') return true
  if (!params.discovery.endpoint) return true
  if (params.provider.type !== 'openai-compatible') return false

  const providerOrigin = new URL(params.provider.baseURL).origin
  const endpointOrigin = new URL(params.endpoint).origin
  return endpointOrigin === providerOrigin
}

function authorizationHeaders(
  provider: ProviderConfig,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  if (provider.type !== 'openai-compatible' || !provider.apiKeyEnv) return {}
  const apiKey = env[provider.apiKeyEnv]
  if (!apiKey) {
    throw new Error(
      `Missing environment variable '${provider.apiKeyEnv}' required to discover provider models.`,
    )
  }
  return { Authorization: `Bearer ${apiKey}` }
}

function createDiscoveryAbortSignal(params: {
  parent?: AbortSignal
  timeoutMs: number
}): { signal?: AbortSignal; cleanup: () => void } {
  const { parent, timeoutMs } = params
  if (timeoutMs <= 0) {
    return { signal: parent, cleanup: () => {} }
  }

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const abort = (reason: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason)
  }
  const onParentAbort = () => abort(parent?.reason)

  if (parent?.aborted) {
    abort(parent.reason)
  } else {
    parent?.addEventListener('abort', onParentAbort, { once: true })
    timeout = setTimeout(() => {
      abort(
        new Error(
          `Model discovery timed out after ${timeoutMs}ms.`,
        ),
      )
    }, timeoutMs)
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeout) clearTimeout(timeout)
      parent?.removeEventListener('abort', onParentAbort)
    },
  }
}

// ---------------------------------------------------------------------------
// OpenRouter capability mapping
// ---------------------------------------------------------------------------

function openRouterCapabilities(
  model: Record<string, unknown>,
): ModelCapabilities | undefined {
  const contextLength =
    typeof model.context_length === 'number'
      ? model.context_length
      : undefined
  const pricing =
    typeof model.pricing === 'object' && model.pricing
      ? (model.pricing as Record<string, unknown>)
      : undefined
  const prompt =
    typeof pricing?.prompt === 'string'
      ? Number(pricing.prompt) * 1_000_000
      : undefined
  const completion =
    typeof pricing?.completion === 'string'
      ? Number(pricing.completion) * 1_000_000
      : undefined
  return {
    ...(contextLength ? { context: { windowTokens: contextLength } } : {}),
    ...(Number.isFinite(prompt) || Number.isFinite(completion)
      ? {
          pricing: {
            ...(Number.isFinite(prompt)
              ? { inputPerMillionTokens: prompt }
              : {}),
            ...(Number.isFinite(completion)
              ? { outputPerMillionTokens: completion }
              : {}),
            currency: 'USD',
          },
        }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Normalise response
// ---------------------------------------------------------------------------

function normalizeModelsFromResponse(params: {
  json: unknown
  strategy: ModelDiscoveryStrategy
  arrayPath?: string
  idPath?: string
}): DiscoveredModel[] {
  const arrayPath =
    params.arrayPath ?? (params.strategy === 'ollama' ? 'models' : 'data')
  const idPath =
    params.idPath ?? (params.strategy === 'ollama' ? 'name' : 'id')
  const array = getByPath(params.json, arrayPath)
  if (!Array.isArray(array)) {
    throw new Error(
      `Discovery response did not contain an array at '${arrayPath}'.`,
    )
  }

  return array
    .map((item): DiscoveredModel | undefined => {
      const id = getByPath(item, idPath)
      if (typeof id !== 'string' || !id.trim()) return undefined
      const object =
        typeof item === 'object' && item
          ? (item as Record<string, unknown>)
          : {}
      return {
        id: id.trim(),
        name: typeof object.name === 'string' ? object.name : undefined,
        created:
          typeof object.created === 'number' ? object.created : undefined,
        capabilities:
          params.strategy === 'openrouter'
            ? openRouterCapabilities(object)
            : undefined,
        raw: item,
      }
    })
    .filter((model): model is DiscoveredModel => Boolean(model))
    .sort((a, b) => a.id.localeCompare(b.id))
}

// ---------------------------------------------------------------------------
// Discovery configuration resolution
// ---------------------------------------------------------------------------

export function getProviderDiscoveryConfig(
  providerId: string,
  provider: ProviderConfig,
): ModelDiscoveryConfig | undefined {
  if (provider.type !== 'openai-compatible') return undefined
  const providerDiscovery = provider.discovery
  if (providerDiscovery) return providerDiscovery
  if (
    providerId === 'openrouter' ||
    provider.baseURL.includes('openrouter.ai')
  )
    return { strategy: 'openrouter' }
  if (
    providerId === 'ollama' ||
    provider.baseURL.includes('localhost:11434') ||
    provider.baseURL.includes('127.0.0.1:11434')
  )
    return { strategy: 'ollama' }
  return { strategy: 'openai-compatible' }
}

// ---------------------------------------------------------------------------
// Core discovery routine
// ---------------------------------------------------------------------------

export async function discoverProviderModels(
  params: DiscoverProviderModelsParams,
): Promise<ProviderModelDiscoveryResult> {
  const env = params.env ?? getSystemProcessEnv()
  const loadedConfig = params.loadedConfig ?? loadProviderConfigSync({ env })
  const provider = loadedConfig.config.providers[params.providerId]
  if (!provider)
    throw new Error(`Provider '${params.providerId}' is not configured.`)
  const discovery = getProviderDiscoveryConfig(params.providerId, provider)
  if (!discovery)
    throw new Error(
      `Provider '${params.providerId}' does not support live model discovery.`,
    )
  const strategy = discovery.strategy ?? 'openai-compatible'
  const endpoint = normalizeEndpoint(provider, discovery)
  const timeoutMs = params.timeoutMs ?? DEFAULT_MODEL_DISCOVERY_TIMEOUT_MS
  const { signal, cleanup } = createDiscoveryAbortSignal({
    parent: params.signal,
    timeoutMs,
  })

  let response: Response
  try {
    response = await params.fetch(endpoint, {
      signal,
      headers: {
        Accept: 'application/json',
        ...(shouldSendAuthorizationHeader({ provider, discovery, endpoint })
          ? authorizationHeaders(provider, env)
          : {}),
      },
    })
  } catch (error) {
    if (signal?.aborted && signal.reason instanceof Error) {
      throw signal.reason
    }
    throw error
  } finally {
    cleanup()
  }
  if (!response.ok) {
    throw new Error(
      `Model discovery failed for '${params.providerId}' (${response.status} ${response.statusText}).`,
    )
  }
  const json = await response.json()
  const result = {
    providerId: params.providerId,
    fetchedAt: new Date().toISOString(),
    models: normalizeModelsFromResponse({
      json,
      strategy,
      arrayPath: discovery.arrayPath,
      idPath: discovery.idPath,
    }),
  }
  writeModelDiscoveryCache(result)
  return result
}

// ---------------------------------------------------------------------------
// Cache read / write
// ---------------------------------------------------------------------------

export function readModelDiscoveryCache(): Record<
  string,
  ProviderModelDiscoveryResult
> {
  const cachePath = resolveCachePath()
  if (!fs.existsSync(cachePath)) return {}
  try {
    return JSON.parse(
      fs.readFileSync(cachePath, 'utf8'),
    ) as Record<string, ProviderModelDiscoveryResult>
  } catch {
    // Corrupt or unreadable cache — treat as empty so discovery can re-populate.
    return {}
  }
}

export function writeModelDiscoveryCache(
  result: ProviderModelDiscoveryResult,
): void {
  const cachePath = resolveCachePath()
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  const cache = readModelDiscoveryCache()
  cache[result.providerId] = result
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n')
}

export function getCachedProviderModels(
  providerId: string,
): DiscoveredModel[] {
  return readModelDiscoveryCache()[providerId]?.models ?? []
}

// ---------------------------------------------------------------------------
// Merged view: configured + cached
// ---------------------------------------------------------------------------

export function getAvailableProviderModels(
  loadedConfig = loadProviderConfigSync(),
): Array<
  DiscoveredModel & { providerId: string; configured: boolean }
> {
  const cache = readModelDiscoveryCache()
  const out: Array<
    DiscoveredModel & { providerId: string; configured: boolean }
  > = []
  for (const [providerId, provider] of Object.entries(
    loadedConfig.config.providers,
  )) {
    const configured = new Set(
      Array.isArray(provider.models)
        ? provider.models
        : Object.keys(provider.models),
    )
    for (const model of cache[providerId]?.models ?? []) {
      out.push({
        ...model,
        providerId,
        configured:
          configured.has(model.id) ||
          configured.has(`${providerId}/${model.id}`),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Persist a discovered model to provider config
// ---------------------------------------------------------------------------

export function addDiscoveredModelToProviderConfig(params: {
  providerId: string
  modelId: string
  cwd?: string
  loadedConfig?: LoadedProviderConfig
}): string {
  const loadedConfig = params.loadedConfig ?? loadProviderConfigSync()
  const provider = loadedConfig.config.providers[params.providerId]
  if (!provider)
    throw new Error(`Provider '${params.providerId}' is not configured.`)

  // Strip provider prefix if the caller passed a full routable ID like
  // "ollama/llama3" so we store "llama3" rather than "ollama/llama3" inside
  // the provider's models array (which would produce double-prefixed routes).
  const prefix = `${params.providerId}/`
  const modelId = params.modelId.startsWith(prefix)
    ? params.modelId.slice(prefix.length)
    : params.modelId

  const config: ProviderConfigFileInput = structuredClone(
    loadedConfig.config,
  )
  const editableProvider = config.providers?.[params.providerId]
  if (!editableProvider)
    throw new Error(`Provider '${params.providerId}' is not editable.`)
  if (Array.isArray(editableProvider.models)) {
    editableProvider.models = Array.from(
      new Set([...editableProvider.models, modelId]),
    ).sort()
  } else {
    editableProvider.models = {
      ...editableProvider.models,
      [modelId]: modelId,
    }
  }
  const parseResult = providerConfigFileSchema.safeParse(config)
  if (!parseResult.success)
    throw new Error(
      `Invalid provider config after adding model: ${parseResult.error.message}`,
    )
  const sourceConfigPath = loadedConfig.sourceFilePaths.at(-1)
  return writeProviderConfigFile({
    cwd: params.cwd ?? (sourceConfigPath ? path.dirname(sourceConfigPath) : undefined),
    config,
  })
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatDiscoveredModels(
  providerId: string,
  result: ProviderModelDiscoveryResult,
  loadedConfig = loadProviderConfigSync(),
): string {
  const lines: string[] = []
  const provider = loadedConfig.config.providers[providerId]
  const configured = new Set(
    provider && Array.isArray(provider.models)
      ? provider.models
      : Object.keys(provider?.models ?? {}),
  )
  lines.push(
    `Discovered ${result.models.length} model(s) for ${providerId} (fetched ${result.fetchedAt}):`,
  )
  lines.push('')
  for (const model of result.models) {
    const isConfigured =
      configured.has(model.id) ||
      configured.has(`${providerId}/${model.id}`)
    const suffix = isConfigured ? ' (configured)' : ' (discovered)'
    lines.push(`  ${model.id}${suffix}`)
  }
  lines.push('')
  lines.push(
    `Use /provider models ${providerId} add <model-id> to add a discovered model to your config.`,
  )
  lines.push(
    `Use /provider models ${providerId} --refresh to update discovered models.`,
  )
  return lines.join('\n')
}
