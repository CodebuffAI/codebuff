/**
 * Server environment variable contract types for dependency injection.
 *
 * ServerEnv extends ClientEnv with server-side secrets (API keys, DB URLs, etc.).
 * This follows the architecture defined in common/src/types/contracts/env.ts.
 */

import type { ServerEnv } from '../../env-schema'
import type {
  BaseCiEnv,
  BaseEnv,
  CiEnv,
  ProcessEnv,
  ClientEnv,
} from '@codebuff/common/types/contracts/env'

// Re-export common base types
export type {
  BaseCiEnv,
  BaseEnv,
  CiEnv,
  ProcessEnv,
  ClientEnv,
} from '@codebuff/common/types/contracts/env'

// Re-export server env type
export type { ServerEnv } from '../../env-schema'

/**
 * Function type for getting a server env value.
 */
export type GetServerEnvFn = () => ServerEnv

/**
 * Server env deps with base env (minimal).
 */
export type ServerEnvDeps = {
  serverEnv: ServerEnv
  env: BaseEnv
}

/**
 * Full server env deps including CI vars.
 */
export type FullServerEnvDeps = {
  serverEnv: ServerEnv
  env: BaseEnv
  ciEnv: CiEnv
}
