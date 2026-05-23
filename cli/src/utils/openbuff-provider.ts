import {
  OPENBUFF_PROVIDER_PRESETS,
  createProviderPresetConfig,
  describeLoadedProviderConfig,
  getMissingProviderEnvVars,
  loadProviderConfigSync,
  resolveConfiguredAgentModel,
  resolveConfiguredAgentModelConfig,
  resolveConfiguredProviderModel,
  writeProviderConfigFile,
} from '@codebuff/sdk'

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
  return typeof agent === 'string' ? '' : agent.model
}

const REASONING_EFFORTS = [
  'default',
  'low',
  'medium',
  'high',
  'minimal',
  'none',
] as const

type ReasoningEffortInput = OpenbuffReasoningEffort | 'default' | undefined

type ModelRouteTarget =
  | { type: 'default' }
  | { type: 'mode'; mode: 'default' | 'lite' | 'max' | 'plan' }
  | { type: 'agent'; agentId: string }
  | { type: 'editor-proposal'; proposalNumber: number }
  | { type: 'editor-selector' }

function formatReasoningEffort(
  effort: OpenbuffReasoningEffort | undefined,
): string {
  return effort ? ` (reasoning: ${effort})` : ''
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

function setRouteModel(
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

  if (target.type === 'agent') {
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
    return
  }

  if (target.type === 'editor-proposal') {
    const proposalModels = [
      ...(config.editorMultiPrompt?.proposalModels ?? []),
    ]
    while (proposalModels.length < target.proposalNumber) {
      proposalModels.push(model)
    }
    proposalModels[target.proposalNumber - 1] = model

    const proposalReasoningEfforts = [
      ...(config.editorMultiPrompt?.proposalReasoningEfforts ?? []),
    ]
    if (reasoningEffort === 'default') {
      while (proposalReasoningEfforts.length < target.proposalNumber) {
        proposalReasoningEfforts.push(undefined)
      }
      proposalReasoningEfforts[target.proposalNumber - 1] = undefined
    } else if (reasoningEffort) {
      while (proposalReasoningEfforts.length < target.proposalNumber) {
        proposalReasoningEfforts.push(undefined)
      }
      proposalReasoningEfforts[target.proposalNumber - 1] = reasoningEffort
    }

    config.editorMultiPrompt = {
      ...(config.editorMultiPrompt ?? {}),
      proposalModels,
      ...(proposalReasoningEfforts.length ? { proposalReasoningEfforts } : {}),
    }
    return
  }

  config.editorMultiPrompt = {
    ...(config.editorMultiPrompt ?? {}),
    selectorModel: model,
  }
  if (reasoningEffort === 'default') {
    delete config.editorMultiPrompt.selectorReasoningEffort
  } else if (reasoningEffort) {
    config.editorMultiPrompt.selectorReasoningEffort = reasoningEffort
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
  } else if (target.type === 'mode') {
    if (reasoningEffort === 'default' || !reasoningEffort) {
      delete config.modeReasoningEfforts?.[target.mode]
    } else {
      config.modeReasoningEfforts = {
        ...(config.modeReasoningEfforts ?? {}),
        [target.mode]: reasoningEffort,
      }
    }
  } else if (target.type === 'agent') {
    if (reasoningEffort === 'default' || !reasoningEffort) {
      delete config.agentReasoningEfforts?.[target.agentId]
    } else {
      config.agentReasoningEfforts = {
        ...(config.agentReasoningEfforts ?? {}),
        [target.agentId]: reasoningEffort,
      }
    }
  } else if (target.type === 'editor-proposal') {
    const proposalReasoningEfforts = [
      ...(config.editorMultiPrompt?.proposalReasoningEfforts ?? []),
    ]
    while (proposalReasoningEfforts.length < target.proposalNumber) {
      proposalReasoningEfforts.push(undefined)
    }
    proposalReasoningEfforts[target.proposalNumber - 1] =
      reasoningEffort === 'default' ? undefined : reasoningEffort
    config.editorMultiPrompt = {
      ...(config.editorMultiPrompt ?? {}),
      proposalReasoningEfforts,
    }
  } else {
    config.editorMultiPrompt = { ...(config.editorMultiPrompt ?? {}) }
    if (reasoningEffort === 'default' || !reasoningEffort) {
      delete config.editorMultiPrompt.selectorReasoningEffort
    } else {
      config.editorMultiPrompt.selectorReasoningEffort = reasoningEffort
    }
  }
}

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
    'Use `/provider add` for the wizard, `/provider connect codex` for Codex OAuth, or `/setup <preset>` for a preset.',
  ].join('\n')
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
    lines.push(
      `${mode.toLowerCase()}: ${agentId} -> ${route.model}${formatReasoningEffort(route.reasoningEffort)}`,
    )
  }

  lines.push('')
  if (loadedConfig.config.editorMultiPrompt) {
    lines.push('Multi-prompt editor:')
    loadedConfig.config.editorMultiPrompt.proposalModels?.forEach(
      (model, index) => {
        const route = resolveConfiguredAgentModelConfig({
          agentId: `editor-implementor-proposal-${index + 1}`,
          model,
          loadedConfig,
        })
        lines.push(
          `proposal #${index + 1}: editor-implementor-proposal-${index + 1} -> ${route.model}${formatReasoningEffort(route.reasoningEffort)}`,
        )
      },
    )
    const selectorRoute = resolveConfiguredAgentModelConfig({
      agentId: 'best-of-n-selector2',
      model:
        loadedConfig.config.editorMultiPrompt.selectorModel ?? '(agent default)',
      loadedConfig,
    })
    lines.push(
      `selector: best-of-n-selector2 -> ${selectorRoute.model}${formatReasoningEffort(selectorRoute.reasoningEffort)}`,
    )
    lines.push('')
  }
  lines.push(`Config files: ${loadedConfig.sourceFilePaths.join(', ') || 'not found'}`)
  lines.push(`Agent overrides: ${Object.keys(loadedConfig.config.agents ?? {}).length}`)

  const missing = getMissingProviderEnvVars({ loadedConfig })
  if (missing.length) {
    lines.push('')
    lines.push(`Missing env: ${missing.join(', ')}`)
  }

  return lines.join('\n')
}

function writeMergedConfig(config: ProviderConfigFileInput): string {
  return writeProviderConfigFile({
    cwd: getProjectRoot(),
    config,
    force: true,
  })
}

function getEditableConfig(): ProviderConfigFileInput {
  const loadedConfig = loadProviderConfigSync()
  return {
    providers: loadedConfig.config.providers,
    defaultModel: loadedConfig.config.defaultModel,
    defaultReasoningEffort: loadedConfig.config.defaultReasoningEffort,
    modes: loadedConfig.config.modes,
    modeReasoningEfforts: loadedConfig.config.modeReasoningEfforts,
    agents: loadedConfig.config.agents,
    agentReasoningEfforts: loadedConfig.config.agentReasoningEfforts,
    editorMultiPrompt: loadedConfig.config.editorMultiPrompt,
  }
}

function getKnownModels(): string[] {
  const loadedConfig = loadProviderConfigSync()
  const models: string[] = []
  for (const [providerId, provider] of Object.entries(loadedConfig.config.providers)) {
    if (Array.isArray(provider.models)) {
      for (const model of provider.models) {
        models.push(model.includes('/') ? model : `${providerId}/${model}`)
      }
    } else {
      for (const requestedModel of Object.keys(provider.models)) {
        models.push(
          requestedModel.includes('/')
            ? requestedModel
            : `${providerId}/${requestedModel}`,
        )
      }
    }
  }
  return Array.from(new Set(models)).sort()
}

function formatModelChoices(): string {
  const models = getKnownModels()
  if (!models.length) {
    return 'No provider models are configured yet. Run `/provider add` first.'
  }
  return models.map((model, index) => `${index + 1}. ${model}`).join('\n')
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
      '- /models set mode <default|lite|max|plan> <provider/model> [reasoningEffort]',
      '- /models set agent <agent-id> <provider/model> [reasoningEffort]',
      '- /models set editor-proposal <1-5> <provider/model> [reasoningEffort]',
      '- /models set editor-selector <provider/model> [reasoningEffort]',
      '- /models set reasoning default|mode|agent|editor-proposal|editor-selector ... <effort>',
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
      const mode = parts[3] as 'default' | 'lite' | 'max' | 'plan'
      const effort = parseReasoningEffort(parts[4])
      if (!mode || !['default', 'lite', 'max', 'plan'].includes(mode) || !effort) {
        throw new Error('Usage: /models set reasoning mode <default|lite|max|plan> <effort>')
      }
      setRouteReasoningEffort(config, { type: 'mode', mode }, effort)
    } else if (routeTarget === 'agent') {
      const agentId = parts[3]
      const effort = parseReasoningEffort(parts[4])
      if (!agentId || !effort) {
        throw new Error('Usage: /models set reasoning agent <agent-id> <effort>')
      }
      setRouteReasoningEffort(config, { type: 'agent', agentId }, effort)
    } else if (routeTarget === 'editor-proposal') {
      const proposalNumber = Number(parts[3])
      const effort = parseReasoningEffort(parts[4])
      if (
        !Number.isInteger(proposalNumber) ||
        proposalNumber < 1 ||
        proposalNumber > 5 ||
        !effort
      ) {
        throw new Error('Usage: /models set reasoning editor-proposal <1-5> <effort>')
      }
      setRouteReasoningEffort(
        config,
        { type: 'editor-proposal', proposalNumber },
        effort,
      )
    } else if (routeTarget === 'editor-selector') {
      const effort = parseReasoningEffort(parts[3])
      if (!effort) {
        throw new Error('Usage: /models set reasoning editor-selector <effort>')
      }
      setRouteReasoningEffort(config, { type: 'editor-selector' }, effort)
    } else {
      throw new Error('Usage: /models set reasoning default|mode|agent|editor-proposal|editor-selector ... <effort>')
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
    const mode = parts[2] as 'default' | 'lite' | 'max' | 'plan'
    const model = parts[3]
    if (!mode || !['default', 'lite', 'max', 'plan'].includes(mode) || !model) {
      throw new Error('Usage: /models set mode <default|lite|max|plan> <provider/model> [reasoningEffort]')
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
  } else if (target === 'editor-proposal') {
    const proposalNumber = Number(parts[2])
    const model = parts[3]
    if (
      !Number.isInteger(proposalNumber) ||
      proposalNumber < 1 ||
      proposalNumber > 5 ||
      !model
    ) {
      throw new Error('Usage: /models set editor-proposal <1-5> <provider/model> [reasoningEffort]')
    }
    setRouteModel(
      config,
      { type: 'editor-proposal', proposalNumber },
      resolveModelChoice(model),
      parseReasoningEffort(parts[4]),
    )
  } else if (target === 'editor-selector') {
    const model = parts[2]
    if (!model) {
      throw new Error('Usage: /models set editor-selector <provider/model> [reasoningEffort]')
    }
    setRouteModel(
      config,
      { type: 'editor-selector' },
      resolveModelChoice(model),
      parseReasoningEffort(parts[3]),
    )
  } else {
    throw new Error('Usage: /models set default|mode|agent|editor-proposal|editor-selector|reasoning ...')
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

function providerPresetMenu(): string {
  const presets = Object.values(OPENBUFF_PROVIDER_PRESETS)
  return [
    'Choose a provider to add:',
    ...presets.map((preset, index) => `${index + 1}. ${preset.label} (${preset.id})`),
    `${presets.length + 1}. Custom OpenAI-compatible provider`,
    '',
    'Type a number or preset id. Press Escape to cancel.',
  ].join('\n')
}

type ProviderWizardState =
  | { step: 'provider' }
  | { step: 'custom-id' }
  | { step: 'custom-base-url'; id: string }
  | { step: 'custom-api-key-env'; id: string; baseURL: string }
  | { step: 'custom-models'; id: string; baseURL: string; apiKeyEnv?: string }

let providerWizardState: ProviderWizardState | null = null

type ModelsWizardState =
  | { step: 'target' }
  | { step: 'mode' }
  | { step: 'agent-id' }
  | { step: 'editor-target' }
  | { step: 'agent-model'; agentId: string }
  | { step: 'default-model' }
  | { step: 'mode-model'; mode: 'default' | 'lite' | 'max' | 'plan' }
  | { step: 'editor-proposal-model'; proposalNumber: number }
  | { step: 'editor-selector-model' }
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
    '2. mode (default/lite/max/plan)',
    '3. agent/subagent override',
    '4. multi-prompt editor proposal/selector',
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
          'Custom provider id? Use a short id such as `zai`, `local`, or `my-provider`.',
      }
    }

    return { done: false, message: `Unknown provider choice.\n\n${providerPresetMenu()}` }
  }

  if (providerWizardState.step === 'custom-id') {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
      return { done: false, message: 'Use letters, numbers, dashes, or underscores.' }
    }
    providerWizardState = { step: 'custom-base-url', id: value }
    return {
      done: false,
      message: 'Base URL? Example: https://api.example.com/v1 or http://localhost:11434/v1',
    }
  }

  if (providerWizardState.step === 'custom-base-url') {
    providerWizardState = {
      step: 'custom-api-key-env',
      id: providerWizardState.id,
      baseURL: value,
    }
    return {
      done: false,
      message:
        'API key env var? Example: MY_PROVIDER_API_KEY. Type `none` for a local unauthenticated provider.',
    }
  }

  if (providerWizardState.step === 'custom-api-key-env') {
    providerWizardState = {
      step: 'custom-models',
      id: providerWizardState.id,
      baseURL: providerWizardState.baseURL,
      apiKeyEnv: value.toLowerCase() === 'none' ? undefined : value,
    }
    return {
      done: false,
      message: 'Model ids? Enter comma-separated model names, e.g. qwen-coder,glm-4.6',
    }
  }

  const models = value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
  if (!models.length) {
    return { done: false, message: 'Enter at least one model id.' }
  }

  const config: ProviderConfigFileInput = {
    providers: {
      [providerWizardState.id]: {
        type: 'openai-compatible',
        baseURL: providerWizardState.baseURL,
        ...(providerWizardState.apiKeyEnv
          ? { apiKeyEnv: providerWizardState.apiKeyEnv }
          : {}),
        models,
      },
    },
  }
  providerWizardState = null
  const configPath = writeProviderConfigFile({
    cwd: getProjectRoot(),
    config,
  })
  return {
    done: true,
    message: [
      `Wrote ${configPath}`,
      '',
      'Custom provider added.',
      'Run `/models configure` to route a mode or agent to it.',
    ].join('\n'),
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
        message: 'Which mode? Type one of: default, lite, max, plan',
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
    if (
      value === '4' ||
      value.toLowerCase() === 'editor' ||
      value.toLowerCase() === 'multi-prompt'
    ) {
      modelsWizardState = { step: 'editor-target' }
      return {
        done: false,
        message: 'Route which multi-prompt editor slot? Type proposal 1-5, or selector.',
      }
    }
    return {
      done: false,
      message:
        'Choose 1 for default, 2 for mode, 3 for agent/subagent, or 4 for multi-prompt editor.',
    }
  }

  if (modelsWizardState.step === 'mode') {
    const mode = value.toLowerCase()
    if (!['default', 'lite', 'max', 'plan'].includes(mode)) {
      return { done: false, message: 'Type one of: default, lite, max, plan' }
    }
    modelsWizardState = {
      step: 'mode-model',
      mode: mode as 'default' | 'lite' | 'max' | 'plan',
    }
    return { done: false, message: `Choose model for ${mode}:\n\n${formatModelChoices()}` }
  }

  if (modelsWizardState.step === 'agent-id') {
    modelsWizardState = { step: 'agent-model', agentId: value }
    return { done: false, message: `Choose model for ${value}:\n\n${formatModelChoices()}` }
  }

  if (modelsWizardState.step === 'editor-target') {
    if (value.toLowerCase() === 'selector') {
      modelsWizardState = { step: 'editor-selector-model' }
      return {
        done: false,
        message: `Choose model for multi-prompt selector:\n\n${formatModelChoices()}`,
      }
    }
    const proposalNumber = Number(value.replace(/^proposal\s*/i, ''))
    if (
      !Number.isInteger(proposalNumber) ||
      proposalNumber < 1 ||
      proposalNumber > 5
    ) {
      return { done: false, message: 'Type proposal 1-5, or selector.' }
    }
    modelsWizardState = {
      step: 'editor-proposal-model',
      proposalNumber,
    }
    return {
      done: false,
      message: `Choose model for multi-prompt proposal #${proposalNumber}:\n\n${formatModelChoices()}`,
    }
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
  } else if (modelsWizardState.step === 'editor-proposal-model') {
    targetForReasoning = {
      type: 'editor-proposal',
      proposalNumber: modelsWizardState.proposalNumber,
    }
  } else if (modelsWizardState.step === 'editor-selector-model') {
    targetForReasoning = { type: 'editor-selector' }
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

export function handleOpenbuffProviderCommand(args: string): {
  message: string
  startWizard?: true
  connectCodex?: true
} {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const [command, ...rest] = parts
  if (!command) {
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

  return {
    message: [
      formatOpenbuffProviderStatus(),
      '',
      'Commands:',
      '- /provider add',
      '- /provider add <preset>',
      '- /provider remove <provider-id>',
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
        'Openbuff provider is not configured. Run `/setup opencode-go`, `/setup openai`, `/setup openrouter`, `/setup ollama`, or `/provider` for details.',
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
