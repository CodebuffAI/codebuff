import type { CiEnv } from './types/contracts/env'

/**
 * Test-only helpers for CI env snapshots.
 * Keep production code using `@codebuff/common/env-ci`.
 */
export const createTestCiEnv = (overrides: Partial<CiEnv> = {}): CiEnv => ({
  CI: undefined,
  GITHUB_ACTIONS: undefined,
  RENDER: undefined,
  IS_PULL_REQUEST: undefined,
  CODEBUFF_GITHUB_TOKEN: undefined,
  CODEBUFF_API_KEY: 'test-api-key',
  ...overrides,
})
