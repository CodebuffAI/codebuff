/**
 * Evals-specific environment variable types.
 *
 * Extends base types from common with eval-specific vars for:
 * - CI/CD pipeline configuration
 * - Eval results reporting
 */

import type { BaseCiEnv } from '@codebuff/common/types/contracts/env'

/**
 * Evals-specific CI env vars.
 */
export type EvalsCiEnv = BaseCiEnv & {
  CODEBUFF_GITHUB_TOKEN?: string
  CODEBUFF_API_KEY?: string
  EVAL_RESULTS_EMAIL?: string
}

/**
 * Function type for getting evals CI env values.
 */
export type GetEvalsCiEnvFn = () => EvalsCiEnv
