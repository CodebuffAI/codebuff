export const BYOK_OPENROUTER_HEADER = 'x-openrouter-api-key'
export const BYOK_OPENROUTER_ENV_VAR = 'CODEBUFF_BYOK_OPENROUTER'

/** The user id an SDK BYOK run carries when its caller names none: every such
 * run shares it, so it identifies nobody. */
export const BYOK_LOCAL_USER_ID = 'byok-local'

/** Prefix of the run ids an SDK BYOK run mints for itself (it has no Codebuff
 * run ledger), and how the runtime tells a BYOK run from a hosted one. */
export const BYOK_RUN_ID_PREFIX = 'byok-'
