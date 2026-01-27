/**
 * SDK environment helper for dependency injection.
 *
 * This module provides SDK-specific env helpers that extend the base
 * process env with SDK-specific vars for binary paths and WASM.
 */

import { getBaseEnv } from '@codebuff/common/env-process'
import { BYOK_OPENROUTER_ENV_VAR } from '@codebuff/common/constants/byok'
import { CLAUDE_OAUTH_TOKEN_ENV_VAR } from '@codebuff/common/constants/claude-oauth'
import { CODEX_OAUTH_TOKEN_ENV_VAR } from '@codebuff/common/constants/codex-oauth'
import { API_KEY_ENV_VAR } from '@codebuff/common/constants/paths'

import type { SdkEnv } from './types/env'

/**
 * Get SDK environment values.
 * Composes from getBaseEnv() + SDK-specific vars.
 */
export const getSdkEnv = (): SdkEnv => ({
  ...getBaseEnv(),

  // SDK-specific paths
  CODEBUFF_RG_PATH: process.env.CODEBUFF_RG_PATH,
  CODEBUFF_WASM_DIR: process.env.CODEBUFF_WASM_DIR,

  // Build flags
  VERBOSE: process.env.VERBOSE,
  OVERRIDE_TARGET: process.env.OVERRIDE_TARGET,
  OVERRIDE_PLATFORM: process.env.OVERRIDE_PLATFORM,
  OVERRIDE_ARCH: process.env.OVERRIDE_ARCH,
})

export const getCodebuffApiKeyFromEnv = (): string | undefined => {
  return process.env[API_KEY_ENV_VAR]
}

export const getSystemProcessEnv = (): NodeJS.ProcessEnv => {
  return process.env
}

export const getByokOpenrouterApiKeyFromEnv = (): string | undefined => {
  return process.env[BYOK_OPENROUTER_ENV_VAR]
}

/**
 * Get Claude OAuth token from environment variable.
 * This allows users to provide their Claude Pro/Max OAuth token for direct Anthropic API access.
 */
export const getClaudeOAuthTokenFromEnv = (): string | undefined => {
  return process.env[CLAUDE_OAUTH_TOKEN_ENV_VAR]
}

/**
 * Get Codex OAuth token from environment variable.
 * This allows users to provide their ChatGPT Plus/Pro OAuth token for direct OpenAI API access.
 */
export const getCodexOAuthTokenFromEnv = (): string | undefined => {
  return process.env[CODEX_OAUTH_TOKEN_ENV_VAR]
}
