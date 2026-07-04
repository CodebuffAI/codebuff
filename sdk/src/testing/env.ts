import { createTestBaseEnv } from '@codebirds/common/testing-env-process'

import type { SdkEnv } from '../types/env'

/**
 * Test-only SDK env builder.
 */
export const createTestSdkEnv = (
  overrides: Partial<SdkEnv> = {},
): SdkEnv => ({
  ...createTestBaseEnv(),

  // SDK-specific defaults
  CODEBIRDS_RG_PATH: undefined,
  CODEBIRDS_WASM_DIR: undefined,
  VERBOSE: undefined,
  OVERRIDE_TARGET: undefined,
  OVERRIDE_PLATFORM: undefined,
  OVERRIDE_ARCH: undefined,
  ...overrides,
})
