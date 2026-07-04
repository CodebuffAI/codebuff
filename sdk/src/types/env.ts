/**
 * SDK-specific environment variable types.
 *
 * Extends base types from common with SDK-specific vars for:
 * - Ripgrep binary path configuration
 * - WASM module directory
 */

import type {
  BaseEnv,
  ClientEnv,
} from '@codebirds/common/types/contracts/env'

/**
 * SDK-specific env vars for binary paths and WASM.
 */
export type SdkEnv = BaseEnv & {
  // SDK-specific paths
  CODEBIRDS_RG_PATH?: string
  CODEBIRDS_WASM_DIR?: string

  // Build flags
  VERBOSE?: string
  OVERRIDE_TARGET?: string
  OVERRIDE_PLATFORM?: string
  OVERRIDE_ARCH?: string
}

/**
 * Full SDK env deps combining client env and SDK env.
 */
export type SdkEnvDeps = {
  clientEnv: ClientEnv
  env: SdkEnv
}

/**
 * Function type for getting SDK env values.
 */
export type GetSdkEnvFn = () => SdkEnv
