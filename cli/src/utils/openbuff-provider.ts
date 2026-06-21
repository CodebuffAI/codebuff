import path from 'path'
import {
  OPENBUFF_PROVIDER_PRESETS,
  addDiscoveredModelToProviderConfig,
  createProviderPresetConfig,
  describeLoadedProviderConfig,
  discoverProviderModels,
  formatDiscoveredModels,
  formatModelCapabilitiesSummary,
  getCachedProviderModels,
  getMissingProviderEnvVars,
  getProviderDiscoveryConfig,
  loadProviderConfigSync,
  readModelDiscoveryCache,
  resolveConfiguredAgentModel,
  resolveConfiguredAgentModelConfig,
  resolveConfiguredProviderModel,
  resolveModelCapabilities,
  writeProviderConfigFile,
} from '@codebuff/sdk'

import type { ModelDiscoveryFetch } from '@codebuff/sdk'

import { getProjectRoot } from '../project-files'
import {
  disconnectChatGptOAuth,
  getChatGptOAuthStatus,
} from './chatgpt-oauth'
import { AGENT_MODE_TO_ID, isLocalMode } from './constants'

import type {
  AgentDefinition,
  OpenbuffReasoningEffort,
  ProviderConfigFileInput,
} from '@codebuff/sdk'
import type { AgentMode } from './constants'

function asAgentId(agent: AgentDefinition | string, fallbackMode: AgentMode): string {
  return typeof agent === 'string' ? agent : agent.id || AGENT_MODE_TO_ID[fallbackMode]
}

function asAgentModel(agent: AgentDefinition | string): string {
  return typeof agent === 'string' ? '' : (agent.model ?? '')
}

const REASONING_EFFORTS = [
  'default',
  'low',
  'medium',
  'high',
  'minimal',
  'none',
] as const

export type ReasoningEffortInput = OpenbuffReasoningEffort | 'default' | undefined

export type ModelRouteTarget =
  | { type: 'default' }
  | { type: 'mode'; mode: 'default' | 'plan' }
  | { type: 'agent'; agentId: string }

export type KnownModelOption = {
  model: string
  capabilitiesSummary?: string
  /** True if this model was discovered from a provider endpoint but is not yet in the user's config. */
  discovered?: boolean
}

function formatReasoningEffort(
  effort: OpenbuffReasoningEffort | undefined,
): string {
  return effort ? ` (reasoning: ${effort})` : ''
}

function getProviderIdForModel(
  model: string,
  loadedConfig = loadProviderConfigSync(),
): string | undefined {
  const prefix = model.split('/')[0]
  if (prefix && loadedConfig.config.providers[prefix]) {
    return prefix
  }

  for (const [providerId, provider] of Object.entries(
    loadedConfig.config.providers,
  )) {
    if (Array.isArray(provider.models)) {
      if (provider.models.some((providerModel) => providerModel === model)) {
        return providerId
      }
      continue
    }
    if (
      model in provider.models ||
      Object.values(provider.models).some(
        (providerModel) => providerModel === model,
      )
    ) {
      return providerId
    }
  }

  return undefined
}

function formatCapabilitiesForModel(
  model: string,
  loadedConfig = loadProviderConfigSync(),
): string {
  const providerId = getProviderIdForModel(model, loadedConfig)
  if (!providerId) return ''

  return formatModelCapabilitiesSummary(
    resolveModelCapabilities({
      providerId,
      model,
      loadedConfig,
    }),
  )
}

function formatCapabilitiesSuffix(
  model: string,
  loadedConfig = loadProviderConfigSync(),
): string {
  const summary = formatCapabilitiesForModel(model, loadedConfig)
  return summary ? ` | ${summary}` : ''
}

function parseReasoningEffort(
  value: string | undefined,
): ReasoningEffortInput {
  if (!value) {
    return undefined
  }
  if (value === '-' || value.toLowerCase() === 'default') {
    return 'default'
  }
  const normalized = value.toLowerCase()
  if (!['low', 'medium', 'high', 'minimal', 'none'].includes(normalized)) {
    throw new Error(
      'Reasoning effort must be one of: low, medium, high, minimal, none, default',
    )
  }
  return normalized as OpenbuffReasoningEffort
}

function reasoningEffortMenu(): string {
  return [
    'Reasoning effort?',
    '1. default (use the agent/provider default)',
    '2. low (fast tool loops; recommended for editor proposals)',
    '3. medium (balanced)',
    '4. high (best for planning/review/selection)',
    '5. minimal (cheapest/fastest where supported)',
    '6. none (disable where supported)',
    '',
    'Type a number or name.',
  ].join('\n')
}

function resolveReasoningEffortChoice(value: string): ReasoningEffortInput {
  const numeric = Number(value.trim())
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= REASONING_EFFORTS.length) {
    return parseReasoningEffort(REASONING_EFFORTS[numeric - 1])
  }
  return parseReasoningEffort(value)
}


export function setRouteModel(
  config: ProviderConfigFileInput,
  target: ModelRouteTarget,
  model: string,
  reasoningEffort?: ReasoningEffortInput,
): void {
  if (target.type === 'default') {
    config.defaultModel = model
    if (reasoningEffort === 'default') {
      delete config.defaultReasoningEffort
    } else if (reasoningEffort) {
      config.defaultReasoningEffort = reasoningEffort
    }
    return
  }

  if (target.type === 'mode') {
    config.modes = {
      ...(config.modes ?? {}),
      [target.mode]: model,
    }
    if (reasoningEffort === 'default') {
      delete config.modeReasoningEfforts?.[target.mode]
    } else if (reasoningEffort) {
      config.modeReasoningEfforts = {
        ...(config.modeReasoningEfforts ?? {}),
        [target.mode]: reasoningEffort,
      }
    }
    return
  }

  config.agents = {
    ...(config.agents ?? {}),
    [target.agentId]: model,
  }
  if (reasoningEffort === 'default') {
    delete config.agentReasoningEfforts?.[target.agentId]
  } else if (reasoningEffort) {
    config.agentReasoningEfforts = {
      ...(config.agentReasoningEfforts ?? {}),
      [target.agentId]: reasoningEffort,
    }
  }
}

function setRouteReasoningEffort(
  config: ProviderConfigFileInput,
  target: ModelRouteTarget,
  reasoningEffort: ReasoningEffortInput,
): void {
  if (target.type === 'default') {
    if (reasoningEffort === 'default' || !reasoningEffort) {
      delete config.defaultReasoningEffort
    } else {
      config.defaultReasoningEffort = reasoningEffort
    }
    return
  }
  if (target.type === 'mode') {
    if (reasoningEffort === 'default' || !reasoningEffort) {
      delete config.modeReasoningEfforts?.[target.mode]
    } else {
      config.modeReasoningEfforts = {
        ...(config.modeReasoningEfforts ?? {}),
        [target.mode]: reasoningEffort,
      }
    }
    return
  }
  if (reasoningEffort === 'default' || !reasoningEffort) {
    delete config.agentReasoningEfforts?.[target.agentId]
  } else {
    config.agentReasoningEfforts = {
      ...(config.agentReasoningEfforts ?? {}),
      [target.agentId]: reasoningEffort,
    }
  }
}

export { loadProviderConfigSync }

export function formatOpenbuffProviderStatus(): string {
  const loadedConfig = loadProviderConfigSync()
  const codexStatus = getChatGptOAuthStatus()
  const presetList = Object.values(OPENBUFF_PROVIDER_PRESETS)
    .map((preset) => `- ${preset.id}: ${preset.description}`)
    .join('\n')

  return [
    'Openbuff provider status',
    '',
    describeLoadedProviderConfig(loadedConfig),
    `Codex subscription: ${codexStatus.connected ? 'connected' : 'not connected'}`,
    '',
    'Provider presets:',
    presetList,
    '',
    'Use `/setup` (without args) or `/provider add` for the interactive wizard, `/provider connect codex` for Codex OAuth, or `/setup <preset>` for a preset.',
  ].join('\n')
}

function getRelativeConfigPath(filePath: string): string {
  try {
    return path.relative(process.cwd(), filePath)
  } catch {
    return filePath
  }
}

export function formatOpenbuffModelStatus(): string {
  const loadedConfig = loadProviderConfigSync()
  const lines = ['Openbuff model routing', '']

  for (const [mode, agentId] of Object.entries(AGENT_MODE_TO_ID)) {
    const route = resolveConfiguredAgentModelConfig({
      agentId,
      model: '(agent default)',
      loadedConfig,
    })
    const sourceFile =
      loadedConfig.sourceFiles?.routes?.modes?.[mode.toLowerCase()] ??
      loadedConfig.sourceFiles?.routes?.agents?.[agentId]
    const sourceSuffix = sourceFile ? ` (defined in ${getRelativeConfigPath(sourceFile)})` : ''
    lines.push(
      `${mode.toLowerCase()}: ${agentId} -> ${route.model}${formatReasoningEffort(route.reasoningEffort)}${formatCapabilitiesSuffix(route.model, loadedConfig)}${sourceSuffix}`,
    )
  }

  lines.push('')
  lines.push(`Config files: ${loadedConfig.sourceFilePaths.map(getRelativeConfigPath).join(', ') || 'not found'}`)
  lines.push(`Agent overrides: ${Object.keys(loadedConfig.config.agents ?? {}).length}`)

  const missing = getMissingProviderEnvVars({ loadedConfig })
  if (missing.length) {
    lines.push('')
    lines.push(`Missing env: ${missing.join(', ')}`)
  }

  lines.push('')
  lines.push('Tip: Run `/models configure` to configure routing interactively in a graphical menu, or `/models set default <model-id>` to quickly route your defaults.')

  return lines.join('\n')
}

export function writeMergedConfig(config: ProviderConfigFileInput): string {
  return writeProviderConfigFile({
    cwd: getProjectRoot(),
    config,
    force: true,
  })
}

export function getEditableConfig(): ProviderConfigFileInput {
  const loadedConfig = loadProviderConfigSync()
  return structuredClone({
    providers: loadedConfig.config.providers,
    defaultModel: loadedConfig.config.defaultModel,
    defaultReasoningEffort: loadedConfig.config.defaultReasoningEffort,
    modes: loadedConfig.config.modes,
    modeReasoningEfforts: loadedConfig.config.modeReasoningEfforts,
    agents: loadedConfig.config.agents,
    agentReasoningEfforts: loadedConfig.config.agentReasoningEfforts,
  })
}

/** Persist a discovered model into the provider's config file so it can be routed. */
export function persistModelToProviderConfig(providerId: string, modelId: string): string {
  // Strip provider prefix if the caller passed a full routable ID like
  // "ollama/llama3" so we store "llama3" rather than "ollama/llama3" inside
  // the provider's models array.
  const prefix = `${providerId}/`
  const normalizedModelId = modelId.startsWith(prefix)
    ? modelId.slice(prefix.length)
    : modelId
  return addDiscoveredModelToProviderConfig({
    providerId,
    modelId: normalizedModelId,
    cwd: getProjectRoot(),
  })
}

export function getKnownModelOptions(): KnownModelOption[] {
  const loadedConfig = loadProviderConfigSync()
  const models: KnownModelOption[] = []
  const seen = new Set<string>()
  for (const [providerId, provider] of Object.entries(
    loadedConfig.config.providers,
  )) {
    const providerModels = provider.models
    if (!providerModels || typeof providerModels !== 'object') {
      continue
    }

    if (Array.isArray(providerModels)) {
      for (const model of providerModels) {
        if (typeof model !== 'string') continue
        const routableModel = model.includes('/')
          ? model
          : `${providerId}/${model}`
        seen.add(routableModel)
        models.push({
          model: routableModel,
          capabilitiesSummary: formatCapabilitiesForModel(
            routableModel,
            loadedConfig,
          ),
        })
      }
    } else {
      for (const requestedModel of Object.keys(providerModels)) {
        const routableModel = requestedModel.includes('/')
          ? requestedModel
          : `${providerId}/${requestedModel}`
        seen.add(routableModel)
        models.push({
          model: routableModel,
          capabilitiesSummary: formatCapabilitiesForModel(
            routableModel,
            loadedConfig,
          ),
        })
      }
    }

    // Append cached discovered models not yet in config
    for (const discovered of getCachedProviderModels(providerId)) {
      const routableModel = discovered.id.includes('/')
        ? discovered.id
        : `${providerId}/${discovered.id}`
      if (seen.has(routableModel)) continue
      seen.add(routableModel)
      models.push({
        model: routableModel,
        capabilitiesSummary: discovered.capabilities
          ? formatModelCapabilitiesSummary(discovered.capabilities)
          : formatCapabilitiesForModel(routableModel, loadedConfig) || undefined,
        discovered: true,
      })
    }
  }
  return models.sort((a, b) => a.model.localeCompare(b.model))
}

export function getKnownModels(): string[] {
  return getKnownModelOptions().map((option) => option.model)
}

function formatModelChoices(): string {
  const modelOptions = getKnownModelOptions()
  if (!modelOptions.length) {
    return 'No provider models are configured yet. Run `/provider add` first.'
  }
  return modelOptions
    .map((option, index) => {
      const summary = option.capabilitiesSummary
        ? ` | ${option.capabilitiesSummary}`
        : ''
      return `${index + 1}. ${option.model}${summary}`
    })
    .join('\n')
}

function resolveModelChoice(input: string): string {
  const trimmed = input.trim()
  const models = getKnownModels()
  const numeric = Number(trimmed)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= models.length) {
    return models[numeric - 1]!
  }
  return trimmed
}

export function configureOpenbuffModelFromArgs(args: string): string {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  if (parts[0] === 'configure' || parts[0] === 'wizard') {
    return startOpenbuffModelsWizard()
  }

  if (parts[0] !== 'set') {
    return [
      formatOpenbuffModelStatus(),
      '',
      'Commands:',
      '- /models configure',
      '- /models set default <provider/model> [reasoningEffort]',
      '- /models set mode <default|plan> <provider/model> [reasoningEffort]',
      '- /models set agent <agent-id> <provider/model> [reasoningEffort]',
      '- /models set reasoning default|mode|agent ... <effort>',
    ].join('\n')
  }

  const config = getEditableConfig()
  const target = parts[1]
  if (target === 'reasoning' || target === 'effort') {
    const routeTarget = parts[2]
    if (routeTarget === 'default') {
      const effort = parseReasoningEffort(parts[3])
      if (!effort) throw new Error('Usage: /models set reasoning default <effort>')
      setRouteReasoningEffort(config, { type: 'default' }, effort)
    } else if (routeTarget === 'mode') {
      const mode = parts[3] as 'default' | 'plan'
      const effort = parseReasoningEffort(parts[4])
      if (!mode || !['default', 'plan'].includes(mode) || !effort) {
        throw new Error('Usage: /models set reasoning mode <default|plan> <effort>')
      }
      setRouteReasoningEffort(config, { type: 'mode', mode }, effort)
    } else if (routeTarget === 'agent') {
      const agentId = parts[3]
      const effort = parseReasoningEffort(parts[4])
      if (!agentId || !effort) {
        throw new Error('Usage: /models set reasoning agent <agent-id> <effort>')
      }
      setRouteReasoningEffort(config, { type: 'agent', agentId }, effort)
    } else {
      throw new Error('Usage: /models set reasoning default|mode|agent ... <effort>')
    }
  } else if (target === 'default') {
    const model = parts[2]
    if (!model) throw new Error('Usage: /models set default <provider/model> [reasoningEffort]')
    setRouteModel(
      config,
      { type: 'default' },
      resolveModelChoice(model),
      parseReasoningEffort(parts[3]),
    )
  } else if (target === 'mode') {
    const mode = parts[2] as 'default' | 'plan'
    const model = parts[3]
    if (!mode || !['default', 'plan'].includes(mode) || !model) {
      throw new Error('Usage: /models set mode <default|plan> <provider/model> [reasoningEffort]')
    }
    setRouteModel(
      config,
      { type: 'mode', mode },
      resolveModelChoice(model),
      parseReasoningEffort(parts[4]),
    )
  } else if (target === 'agent') {
    const agentId = parts[2]
    const model = parts[3]
    if (!agentId || !model) {
      throw new Error('Usage: /models set agent <agent-id> <provider/model> [reasoningEffort]')
    }
    setRouteModel(
      config,
      { type: 'agent', agentId },
      resolveModelChoice(model),
      parseReasoningEffort(parts[4]),
    )
  } else {
    throw new Error('Usage: /models set default|mode|agent|reasoning ...')
  }

  const configPath = writeMergedConfig(config)
  return [`Updated ${configPath}`, '', formatOpenbuffModelStatus()].join('\n')
}

export function setupOpenbuffProviderFromArgs(args: string): string {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const force = parts.includes('--force')
  const presetId = parts.find((part) => !part.startsWith('--'))

  if (!presetId) {
    return formatOpenbuffProviderStatus()
  }

  const preset = OPENBUFF_PROVIDER_PRESETS[presetId as keyof typeof OPENBUFF_PROVIDER_PRESETS]
  if (!preset) {
    return [
      `Unknown Openbuff provider preset: ${presetId}`,
      '',
      'Available presets:',
      ...Object.values(OPENBUFF_PROVIDER_PRESETS).map(
        (candidate) => `- ${candidate.id}: ${candidate.label}`,
      ),
    ].join('\n')
  }

  const config = createProviderPresetConfig(presetId)
  const configPath = writeProviderConfigFile({
    cwd: getProjectRoot(),
    config,
    force,
  })

  return [
    `Wrote ${configPath}`,
    '',
    `Preset: ${preset.label}`,
    preset.description,
    '',
    preset.envHelp ? `Next: ${preset.envHelp}` : undefined,
    'Then send a message, or run `/models` to inspect routing.',
  ]
    .filter(Boolean)
    .join('\n')
}

type CustomOpenbuffProviderType = 'openai-compatible' | 'anthropic-compatible'

function parseCustomOpenbuffProviderType(
  value: string,
): CustomOpenbuffProviderType | null {
  const normalized = value.trim().toLowerCase()
  if (
    normalized === '1' ||
    normalized === 'openai' ||
    normalized === 'openai-compatible'
  ) {
    return 'openai-compatible'
  }
  if (
    normalized === '2' ||
    normalized === 'anthropic' ||
    normalized === 'anthropic-compatible' ||
    normalized === 'claude'
  ) {
    return 'anthropic-compatible'
  }
  return null
}

export function addCustomOpenbuffProvider(provider: {
  id: string
  type: CustomOpenbuffProviderType
  baseURL: string
  apiKeyEnv?: string
  models: string[]
}): string {
  const id = provider.id.trim()
  const type = provider.type
  const baseURL = provider.baseURL.trim()
  const apiKeyEnv = provider.apiKeyEnv?.trim()
  const models = provider.models.map((model) => model.trim()).filter(Boolean)

  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error('Provider id must use letters, numbers, dashes, or underscores.')
  }
  if (!baseURL) {
    throw new Error('Provider base URL is required.')
  }
  if (models.length === 0) {
    throw new Error('Enter at least one model id.')
  }

  const config: ProviderConfigFileInput = {
    providers: {
      [id]: {
        type,
        baseURL,
        ...(apiKeyEnv ? { apiKeyEnv } : {}),
        models,
      },
    },
  }
  const configPath = writeProviderConfigFile({
    cwd: getProjectRoot(),
    config,
  })

  return [
    `Wrote ${configPath}`,
    '',
    `Custom ${type} provider '${id}' added.`,
    'Run `/models configure` to route a mode or agent to it.',
  ].join('\n')
}

function providerPresetMenu(): string {
  const presets = Object.values(OPENBUFF_PROVIDER_PRESETS)
  return [
    'Choose a provider to add:',
    ...presets.map((preset, index) => `${index + 1}. ${preset.label} (${preset.id})`),
    `${presets.length + 1}. Custom OpenAI/Anthropic-compatible provider`,
    '',
    'Type a number or preset id. Press Escape to cancel.',
  ].join('\n')
}

type ProviderWizardState =
  | { step: 'provider' }
  | { step: 'custom-id' }
  | { step: 'custom-type'; id: string }
  | { step: 'custom-base-url'; id: string; type: CustomOpenbuffProviderType }
  | {
      step: 'custom-api-key-env'
      id: string
      type: CustomOpenbuffProviderType
      baseURL: string
    }
  | {
      step: 'custom-models'
      id: string
      type: CustomOpenbuffProviderType
      baseURL: string
      apiKeyEnv?: string
    }

let providerWizardState: ProviderWizardState | null = null

type ModelsWizardState =
  | { step: 'target' }
  | { step: 'mode' }
  | { step: 'agent-id' }
  | { step: 'agent-model'; agentId: string }
  | { step: 'default-model' }
  | { step: 'mode-model'; mode: 'default' | 'plan' }
  | { step: 'reasoning-effort'; target: ModelRouteTarget; model: string }

let modelsWizardState: ModelsWizardState | null = null

export function startOpenbuffProviderWizard(): string {
  providerWizardState = { step: 'provider' }
  return ['Openbuff provider wizard', '', providerPresetMenu()].join('\n')
}

export function startOpenbuffModelsWizard(): string {
  modelsWizardState = { step: 'target' }
  return [
    'Openbuff model routing wizard',
    '',
    'What do you want to route?',
    '1. default fallback model',
    '2. mode (default/plan)',
    '3. agent/subagent override',
    '',
    'Type a number. Press Escape to cancel.',
  ].join('\n')
}

export function handleOpenbuffProviderWizardInput(input: string): {
  done: boolean
  message: string
} {
  const value = input.trim()
  if (!providerWizardState) {
    return { done: true, message: 'Provider wizard is not active.' }
  }

  if (providerWizardState.step === 'provider') {
    const presets = Object.values(OPENBUFF_PROVIDER_PRESETS)
    const numeric = Number(value)
    const customIndex = presets.length + 1
    const preset =
      Number.isInteger(numeric) && numeric >= 1 && numeric <= presets.length
        ? presets[numeric - 1]
        : presets.find((candidate) => candidate.id === value)

    if (preset) {
      providerWizardState = null
      return { done: true, message: setupOpenbuffProviderFromArgs(preset.id) }
    }

    if (
      value.toLowerCase() === 'custom' ||
      (Number.isInteger(numeric) && numeric === customIndex)
    ) {
      providerWizardState = { step: 'custom-id' }
      return {
        done: false,
        message:
          'Custom provider id? Use a short id such as `zai`, `anthropic`, `local`, or `my-provider`.',
      }
    }

    return { done: false, message: `Unknown provider choice.\n\n${providerPresetMenu()}` }
  }

  if (providerWizardState.step === 'custom-id') {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
      return { done: false, message: 'Use letters, numbers, dashes, or underscores.' }
    }
    providerWizardState = { step: 'custom-type', id: value }
    return {
      done: false,
      message:
        'Provider type? Type `openai-compatible` for /v1/chat/completions endpoints, or `anthropic-compatible` for Claude Messages API endpoints.',
    }
  }

  if (providerWizardState.step === 'custom-type') {
    const type = parseCustomOpenbuffProviderType(value)
    if (!type) {
      return {
        done: false,
        message:
          'Use `openai-compatible` or `anthropic-compatible` (aliases: openai, anthropic, claude).',
      }
    }
    providerWizardState = { step: 'custom-base-url', id: providerWizardState.id, type }
    return {
      done: false,
      message:
        type === 'anthropic-compatible'
          ? 'Base URL? Example: https://api.anthropic.com or https://cc.freemodel.dev'
          : 'Base URL? Example: https://api.example.com/v1 or http://localhost:11434/v1',
    }
  }

  if (providerWizardState.step === 'custom-base-url') {
    if (!value) {
      return { done: false, message: 'Provider base URL is required.' }
    }

    try {
      const url = new URL(value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { done: false, message: 'Base URL must use http or https.' }
      }
    } catch {
      return {
        done: false,
        message:
          'Enter a valid base URL such as https://api.example.com/v1 or http://localhost:11434/v1.',
      }
    }

    providerWizardState = {
      step: 'custom-api-key-env',
      id: providerWizardState.id,
      type: providerWizardState.type,
      baseURL: value,
    }
    return {
      done: false,
      message:
        'API key env var? Example: MY_PROVIDER_API_KEY. Type `none` for a local unauthenticated provider.',
    }
  }

  if (providerWizardState.step === 'custom-api-key-env') {
    const apiKeyEnv = value.toLowerCase() === 'none' ? undefined : value
    if (apiKeyEnv && !/^[A-Z_][A-Z0-9_]*$/.test(apiKeyEnv)) {
      return {
        done: false,
        message:
          'Use an environment variable name like MY_PROVIDER_API_KEY, or type `none` for a local unauthenticated provider.',
      }
    }

    providerWizardState = {
      step: 'custom-models',
      id: providerWizardState.id,
      type: providerWizardState.type,
      baseURL: providerWizardState.baseURL,
      apiKeyEnv,
    }
    return {
      done: false,
      message:
        providerWizardState.type === 'anthropic-compatible'
          ? 'Model ids? Enter comma-separated Claude model names, e.g. claude-sonnet-4-5,claude-opus-4-5'
          : 'Model ids? Enter comma-separated model names, e.g. qwen-coder,glm-4.6',
    }
  }

  const models = value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
  if (!models.length) {
    return { done: false, message: 'Enter at least one model id.' }
  }

  try {
    const configMessage = addCustomOpenbuffProvider({
      id: providerWizardState.id,
      type: providerWizardState.type,
      baseURL: providerWizardState.baseURL,
      apiKeyEnv: providerWizardState.apiKeyEnv,
      models,
    })
    providerWizardState = null
    return {
      done: true,
      message: configMessage,
    }
  } catch (error) {
    return {
      done: false,
      message: `Failed to add custom provider: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
export function handleOpenbuffModelsWizardInput(input: string): {
  done: boolean
  message: string
} {
  const value = input.trim()
  if (!modelsWizardState) {
    return { done: true, message: 'Model wizard is not active.' }
  }

  if (modelsWizardState.step === 'target') {
    if (value === '1' || value.toLowerCase() === 'default') {
      modelsWizardState = { step: 'default-model' }
      return { done: false, message: `Choose default model:\n\n${formatModelChoices()}` }
    }
    if (value === '2' || value.toLowerCase() === 'mode') {
      modelsWizardState = { step: 'mode' }
      return {
        done: false,
        message: 'Which mode? Type one of: default, plan',
      }
    }
    if (value === '3' || value.toLowerCase() === 'agent') {
      modelsWizardState = { step: 'agent-id' }
      return {
        done: false,
        message:
          'Agent/subagent id? Examples: editor, code-reviewer, thinker, file-picker, base2',
      }
    }
    return {
      done: false,
      message: 'Choose 1 for default, 2 for mode, or 3 for agent/subagent.',
    }
  }

  if (modelsWizardState.step === 'mode') {
    const mode = value.toLowerCase()
    if (!['default', 'plan'].includes(mode)) {
      return { done: false, message: 'Type one of: default, plan' }
    }
    modelsWizardState = {
      step: 'mode-model',
      mode: mode as 'default' | 'plan',
    }
    return { done: false, message: `Choose model for ${mode}:\n\n${formatModelChoices()}` }
  }

  if (modelsWizardState.step === 'agent-id') {
    modelsWizardState = { step: 'agent-model', agentId: value }
    return { done: false, message: `Choose model for ${value}:\n\n${formatModelChoices()}` }
  }

  if (modelsWizardState.step === 'reasoning-effort') {
    const config = getEditableConfig()
    setRouteModel(
      config,
      modelsWizardState.target,
      modelsWizardState.model,
      resolveReasoningEffortChoice(value),
    )
    modelsWizardState = null
    const configPath = writeMergedConfig(config)
    return {
      done: true,
      message: [`Updated ${configPath}`, '', formatOpenbuffModelStatus()].join('\n'),
    }
  }

  const model = resolveModelChoice(value)
  let targetForReasoning: ModelRouteTarget
  if (modelsWizardState.step === 'default-model') {
    targetForReasoning = { type: 'default' }
  } else if (modelsWizardState.step === 'mode-model') {
    targetForReasoning = { type: 'mode', mode: modelsWizardState.mode }
  } else if (modelsWizardState.step === 'agent-model') {
    targetForReasoning = { type: 'agent', agentId: modelsWizardState.agentId }
  } else {
    return { done: true, message: 'Model wizard is not active.' }
  }

  modelsWizardState = {
    step: 'reasoning-effort',
    target: targetForReasoning,
    model,
  }
  return { done: false, message: reasoningEffortMenu() }
}

export async function handleOpenbuffProviderCommand(args: string): Promise<{
  message: string
  startWizard?: true
  connectCodex?: true
}> {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const [command, ...rest] = parts
  if (!command || command === 'status' || command === 'info') {
    return { message: formatOpenbuffProviderStatus() }
  }

  if (command === 'add' || command === 'wizard') {
    if (rest.length === 0) {
      return { message: startOpenbuffProviderWizard(), startWizard: true }
    }
    return { message: setupOpenbuffProviderFromArgs(rest.join(' ')) }
  }

  if (command === 'remove') {
    const providerId = rest[0]
    if (!providerId) throw new Error('Usage: /provider remove <provider-id>')
    const config = getEditableConfig()
    const providers = { ...(config.providers ?? {}) }
    delete providers[providerId]
    config.providers = providers
    const configPath = writeMergedConfig(config)
    return { message: `Removed provider '${providerId}' from ${configPath}.` }
  }

  if (command === 'connect' && (rest[0] === 'codex' || rest[0] === 'chatgpt')) {
    return {
      message: 'Starting Codex/ChatGPT OAuth. Follow the banner instructions.',
      connectCodex: true,
    }
  }

  if (
    ['disconnect', 'logout'].includes(command) &&
    (rest[0] === 'codex' || rest[0] === 'chatgpt')
  ) {
    disconnectChatGptOAuth()
    return { message: 'Disconnected Codex/ChatGPT subscription credentials.' }
  }

  if (command === 'models') {
    const providerId = rest[0]
    if (!providerId) {
      return {
        message: [
          'Usage:',
          '- /provider models <provider-id>              — list cached discovered models',
          '- /provider models <provider-id> --refresh   — refresh from provider endpoint',
          '- /provider models <provider-id> add <model-id> — add a model to config',
        ].join('\n'),
      }
    }
    const loadedConfig = loadProviderConfigSync()
    const provider = loadedConfig.config.providers[providerId]
    if (!provider) {
      return { message: `Provider '${providerId}' is not configured. Run /provider add first.` }
    }

    if (rest[1] === 'add') {
      // Strip provider prefix if user pasted a full routable ID like "ollama/llama3"
      // so we add "llama3" rather than "ollama/llama3" inside the provider models list.
      const prefix = `${providerId}/`
      const modelId = rest[2]?.startsWith(prefix) ? rest[2].slice(prefix.length) : rest[2]
      if (!modelId) {
        return { message: 'Usage: /provider models <provider-id> add <model-id>' }
      }
      try {
        const configPath = addDiscoveredModelToProviderConfig({
          providerId,
          modelId,
          loadedConfig,
          cwd: getProjectRoot(),
        })
        return {
          message: [
            `Added model '${modelId}' to provider '${providerId}'.`,
            `Updated ${configPath}`,
            '',
            formatOpenbuffModelStatus(),
          ].join('\n'),
        }
      } catch (error) {
        return {
          message: `Failed to add model: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }

    const shouldRefresh = rest.includes('--refresh')
    if (shouldRefresh) {
      const discoveryConfig = getProviderDiscoveryConfig(providerId, provider)
      if (!discoveryConfig) {
        return {
          message: `Provider '${providerId}' does not support live model discovery. Add a 'discovery' field to its config in openbuff.json.`,
        }
      }
      try {
        const result = await discoverProviderModels({
          providerId,
          loadedConfig,
          fetch: globalThis.fetch as ModelDiscoveryFetch,
        })
        return { message: formatDiscoveredModels(providerId, result, loadedConfig) }
      } catch (error) {
        return {
          message: `Model discovery failed for '${providerId}': ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }

    // Show cached discovered models
    const cache = readModelDiscoveryCache()
    const cachedResult = cache[providerId]
    const discoveryConfig = getProviderDiscoveryConfig(providerId, provider)
    if (!cachedResult) {
      const hint = discoveryConfig
        ? `Run /provider models ${providerId} --refresh to discover available models, then /provider models ${providerId} add <model-id> to add one to config.`
        : `Provider '${providerId}' does not support live model discovery.`
      return { message: `No cached discovered models for '${providerId}'. ${hint}` }
    }
    return { message: formatDiscoveredModels(providerId, cachedResult, loadedConfig) }
  }

  return {
    message: [
      formatOpenbuffProviderStatus(),
      '',
      'Commands:',
      '- /provider status',
      '- /provider add',
      '- /provider add <preset>',
      '- /provider remove <provider-id>',
      '- /provider models <provider-id> [--refresh]',
      '- /provider models <provider-id> add <model-id>',
      '- /provider connect codex',
      '- /provider disconnect codex',
    ].join('\n'),
  }
}

export function getOpenbuffProviderReadiness(params: {
  agent: AgentDefinition | string
  agentMode: AgentMode
}): { ok: true } | { ok: false; message: string } {
  if (!isLocalMode()) {
    return { ok: true }
  }

  const loadedConfig = loadProviderConfigSync()
  if (
    loadedConfig.sourceFilePaths.length === 0 &&
    Object.keys(loadedConfig.config.providers).length === 0
  ) {
    return {
      ok: false,
      message:
        'Openbuff provider is not configured. Run `/setup opencode-go`, `/setup openai`, `/setup anthropic`, `/setup openrouter`, `/setup ollama`, or `/provider` for details.',
    }
  }

  const agentId = asAgentId(params.agent, params.agentMode)
  const fallbackModel = asAgentModel(params.agent)
  const requestedModel = resolveConfiguredAgentModel({
    agentId,
    model: fallbackModel,
    loadedConfig,
  })

  try {
    const resolvedProvider = resolveConfiguredProviderModel({
      model: requestedModel,
      loadedConfig,
    })
    if (!resolvedProvider) {
      return {
        ok: false,
        message: `Openbuff could not route ${agentId} to model '${requestedModel}'. Run /models and add the model to openbuff.json.`,
      }
    }
    if (
      resolvedProvider.provider.type === 'chatgpt-oauth' &&
      !getChatGptOAuthStatus().connected
    ) {
      return {
        ok: false,
        message:
          `Openbuff routed ${agentId} to '${requestedModel}', but Codex/ChatGPT is not connected. Run /provider connect codex.`,
      }
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  return { ok: true }
}
