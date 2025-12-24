/**
 * CI environment helper for dependency injection.
 *
 * This module provides a typed interface to CI-specific environment variables.
 * These are used in CI/CD pipelines and eval contexts.
 * In tests, use `@codebuff/common/testing-env-ci`.
 */

import type { CiEnv } from './types/contracts/env'

/**
 * Get CI environment values.
 * Returns a snapshot of the current process.env values for CI-specific vars.
 */
export const getCiEnv = (): CiEnv => ({
  CI: process.env.CI,
  GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
  RENDER: process.env.RENDER,
  IS_PULL_REQUEST: process.env.IS_PULL_REQUEST,
  CODEBUFF_GITHUB_TOKEN: process.env.CODEBUFF_GITHUB_TOKEN,
  CODEBUFF_API_KEY: process.env.CODEBUFF_API_KEY,
})

/**
 * Default CI env instance.
 * Use this for production code, inject mocks in tests.
 */
export const ciEnv: CiEnv = getCiEnv()

/**
 * Check if running in CI environment
 */
export const isCI = (): boolean => {
  const env = getCiEnv()
  return env.CI === 'true' || env.CI === '1' || env.GITHUB_ACTIONS === 'true'
}
