/**
 * Static Fireworks deployment config.
 *
 * Kept in its own module (no imports) so it is safe to pull into edge-runtime
 * code paths — e.g. instrumentation.ts — without dragging in the server-only
 * modules that fireworks.ts transitively depends on (bigquery, undici, etc).
 */

export const FIREWORKS_ACCOUNT_ID = 'james-65d217'

/** Which Fireworks upstream a free session is pinned to — and which one
 *  actually served a given request. Single source of truth for this two-value
 *  union; lives in the import-free config module so every layer (llm-api and
 *  the free-session router) shares it without a dependency tangle. */
export type FireworksRoute = 'deployment' | 'serverless'

export const FIREWORKS_DEPLOYMENT_MAP: Record<string, string> = {
  // MiniMax M3: serve from the dedicated deployment first, with the Fireworks
  // serverless API as an automatic backup (see
  // FIREWORKS_SERVERLESS_FALLBACK_MODELS below).
  'minimax/minimax-m3': 'accounts/james-65d217/deployments/aesxbzio',
  // 'minimax/minimax-m2.5': 'accounts/james-65d217/deployments/lnfid5h9',
  // Disabled: route Kimi K2.6 through the Fireworks serverless API (24/7)
  // instead of the dedicated deployment.
  // 'moonshotai/kimi-k2.6': 'accounts/james-65d217/deployments/mjb4i7ea',
  // 'minimax/minimax-m2.7': 'accounts/james-65d217/deployments/nrdudqxd',
}

/**
 * Deployment-mapped models that fall back to the Fireworks serverless API when
 * their dedicated deployment is unavailable (request throws, returns 5xx, is in
 * scaling cooldown) or when a session is deliberately pinned to serverless
 * because the deployment was unhealthy at admission time (see
 * `routeForAdmission` in the free-session layer). For these models the
 * serverless API IS the always-on backup, so a deployment hiccup never surfaces
 * as a hard error and we can shed load off the instance without a waiting room.
 * Other deployment-mapped models only fall back in lite mode.
 *
 * Lives here (the import-free config module) rather than in fireworks.ts so the
 * free-session routing code can read it without pulling in the server-only
 * dependencies fireworks.ts drags along.
 */
export const FIREWORKS_SERVERLESS_FALLBACK_MODELS = new Set<string>([
  'minimax/minimax-m3',
])

/** True when `model` has a Fireworks serverless backup, i.e. a session can be
 *  safely pinned to the serverless API instead of the dedicated deployment. */
export function hasFireworksServerlessBackup(model: string): boolean {
  return FIREWORKS_SERVERLESS_FALLBACK_MODELS.has(model)
}
