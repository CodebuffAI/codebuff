/**
 * BYOK Anthropic configuration management.
 * Allows users to connect their own Anthropic API key and optional proxy.
 */

import fs from 'fs'
import path from 'path'

import {
  BYOK_ANTHROPIC_API_KEY_ENV_VAR,
  BYOK_ANTHROPIC_BASE_URL_ENV_VAR,
  BYOK_ANTHROPIC_MODELS_ENV_VAR,
} from '@codebuff/common/constants/byok'

import { getAuthToken, getConfigDir } from './auth'

export interface ByokAnthropicConfig {
  apiKey: string
  baseUrl?: string
  models?: string
}

const BYOK_CONFIG_FILENAME = 'anthropic-byok.json'

function getByokConfigPath(): string {
  return path.join(getConfigDir(), BYOK_CONFIG_FILENAME)
}

/**
 * Save BYOK Anthropic config to disk.
 */
export function saveByokAnthropicConfig(config: ByokAnthropicConfig): void {
  const configDir = getConfigDir()
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
  fs.writeFileSync(getByokConfigPath(), JSON.stringify(config, null, 2))
}

/**
 * Load BYOK Anthropic config from disk.
 */
export function loadByokAnthropicConfig(): ByokAnthropicConfig | null {
  const configPath = getByokConfigPath()
  if (!fs.existsSync(configPath)) {
    return null
  }
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (!data.apiKey) return null
    return data as ByokAnthropicConfig
  } catch {
    return null
  }
}

/**
 * Clear BYOK Anthropic config from disk and env vars.
 */
export function clearByokAnthropicConfig(): void {
  const configPath = getByokConfigPath()
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath)
  }
  delete process.env[BYOK_ANTHROPIC_API_KEY_ENV_VAR]
  delete process.env[BYOK_ANTHROPIC_BASE_URL_ENV_VAR]
  delete process.env[BYOK_ANTHROPIC_MODELS_ENV_VAR]

  // Reset cached SDK client so it picks up the changed auth state
  const { resetCodebuffClient } = require('./codebuff-client')
  resetCodebuffClient()
}

/**
 * Apply BYOK Anthropic config to process.env so model-provider picks it up.
 */
export function applyByokAnthropicEnv(config: ByokAnthropicConfig): void {
  process.env[BYOK_ANTHROPIC_API_KEY_ENV_VAR] = config.apiKey
  if (config.baseUrl) {
    process.env[BYOK_ANTHROPIC_BASE_URL_ENV_VAR] = config.baseUrl
  }
  if (config.models) {
    process.env[BYOK_ANTHROPIC_MODELS_ENV_VAR] = config.models
  }
}

/**
 * Load saved config and apply to env vars. Call on CLI startup.
 */
export function initByokAnthropic(): void {
  const config = loadByokAnthropicConfig()
  if (config) {
    applyByokAnthropicEnv(config)
  }
}

/**
 * Check if BYOK-only mode is active: BYOK Anthropic is configured
 * AND there is no Codebuff auth token (user has not logged in).
 * In this mode, the CLI bypasses Codebuff login and backend entirely.
 */
export function isByokOnlyMode(): boolean {
  return !!process.env[BYOK_ANTHROPIC_API_KEY_ENV_VAR] && !getAuthToken()
}

/**
 * Get the current BYOK Anthropic connection status.
 */
export function getByokAnthropicStatus(): {
  connected: boolean
  config?: ByokAnthropicConfig
} {
  const config = loadByokAnthropicConfig()
  if (!config) {
    return { connected: false }
  }
  return { connected: true, config }
}

// ============================================================================
// Multi-step input flow
// ============================================================================

type ByokStep = 'api-key' | 'base-url' | 'models'

let currentStep: ByokStep = 'api-key'
let pendingConfig: Partial<ByokAnthropicConfig> = {}

export function getCurrentByokStep(): ByokStep {
  return currentStep
}

export function resetByokFlow(): void {
  currentStep = 'api-key'
  pendingConfig = {}
}

export interface ByokStepResult {
  done: boolean
  message: string
}

/**
 * Process user input for the current BYOK setup step.
 * Empty input means "use default" for base-url and models steps.
 */
export function handleByokStepInput(input: string): ByokStepResult {
  const trimmed = input.trim()

  if (currentStep === 'api-key') {
    if (!trimmed) {
      return { done: false, message: 'API key is required. Please enter your Anthropic API key.' }
    }
    pendingConfig.apiKey = trimmed
    currentStep = 'base-url'
    return {
      done: false,
      message: 'API key saved. Enter base URL (or press Enter for default https://api.anthropic.com):',
    }
  }

  if (currentStep === 'base-url') {
    pendingConfig.baseUrl = trimmed || undefined
    currentStep = 'models'
    const urlMsg = trimmed ? `Base URL set to ${trimmed}.` : 'Using default Anthropic API URL.'
    return {
      done: false,
      message: `${urlMsg} Enter model aliases (e.g. haiku:model-id,sonnet:model-id,opus:model-id) or press Enter to skip:`,
    }
  }

  // models step
  pendingConfig.models = trimmed || undefined
  const config: ByokAnthropicConfig = {
    apiKey: pendingConfig.apiKey!,
    baseUrl: pendingConfig.baseUrl,
    models: pendingConfig.models,
  }
  saveByokAnthropicConfig(config)
  applyByokAnthropicEnv(config)
  resetByokFlow()

  const parts = ['✅ Connected to Anthropic API!']
  parts.push(`  API Key: ${maskApiKey(config.apiKey)}`)
  if (config.baseUrl) parts.push(`  Base URL: ${config.baseUrl}`)
  if (config.models) parts.push(`  Models: ${config.models}`)
  return { done: true, message: parts.join('\n') }
}

/**
 * Mask an API key for display (show first 7 and last 4 chars).
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return '••••••••'
  return key.slice(0, 7) + '••••' + key.slice(-4)
}
