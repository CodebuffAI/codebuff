/**
 * Static Fireworks deployment config.
 *
 * Kept in its own module (no imports) so it is safe to pull into edge-runtime
 * code paths — e.g. instrumentation.ts — without dragging in the server-only
 * modules that fireworks.ts transitively depends on (bigquery, undici, etc).
 */

export const FIREWORKS_ACCOUNT_ID = 'james-65d217'

export const FIREWORKS_DEPLOYMENT_MAP: Record<string, string> = {
  // MiniMax M3: serve from the dedicated deployment first, with the Fireworks
  // serverless API as an automatic backup (see
  // FIREWORKS_SERVERLESS_FALLBACK_MODELS in fireworks.ts).
  'minimax/minimax-m3': 'accounts/james-65d217/deployments/aesxbzio',
  // 'minimax/minimax-m2.5': 'accounts/james-65d217/deployments/lnfid5h9',
  // Disabled: route Kimi K2.6 through the Fireworks serverless API (24/7)
  // instead of the dedicated deployment.
  // 'moonshotai/kimi-k2.6': 'accounts/james-65d217/deployments/mjb4i7ea',
  // 'minimax/minimax-m2.7': 'accounts/james-65d217/deployments/nrdudqxd',
}
