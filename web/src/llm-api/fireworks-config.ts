/**
 * Static Fireworks deployment config.
 *
 * Kept in its own module (no imports) so it is safe to pull into edge-runtime
 * code paths — e.g. instrumentation.ts — without dragging in the server-only
 * modules that fireworks.ts transitively depends on (bigquery, undici, etc).
 */

export const FIREWORKS_ACCOUNT_ID = 'james-65d217'

export const FIREWORKS_DEPLOYMENT_MAP: Record<string, string> = {
  // 'minimax/minimax-m2.5': 'accounts/james-65d217/deployments/lnfid5h9',
  // Disabled: route GLM 5.1 through the Fireworks serverless API during
  // availability hours instead of the dedicated deployment.
  // 'z-ai/glm-5.1': 'accounts/james-65d217/deployments/mjb4i7ea',
  // 'minimax/minimax-m2.7': 'accounts/james-65d217/deployments/nrdudqxd',
}
