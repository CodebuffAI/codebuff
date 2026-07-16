/**
 * Provider failover helpers.
 *
 * Pure functions for resolving the configured failover model list and
 * classifying errors as failover-eligible. Kept separate from
 * `promptAiSdkStream` so they can be unit-tested without streaming or LLM
 * round-trips (mirrors the `error-utils.ts` / `preflight-syntax-validation.ts`
 * pure-helper precedent).
 */

import {
  getErrorStatusCode,
  isProviderContentPolicyError,
} from '../error-utils'

import type { LoadedProviderConfig } from '../provider-config'

/**
 * HTTP status codes that should trigger failover to the next configured
 * backup provider (after the inner retry loop has exhausted its retries for
 * retryable 5xx codes).
 *
 * This is `(RETRYABLE_STATUS_CODES ∪ {401, 403}) − {408, 429}`:
 * - 401/403 (auth): retrying won't help; failover immediately after the retry
 *   loop throws (the retry loop does NOT retry auth errors since they're not
 *   in RETRYABLE_STATUS_CODES, so the outer failover loop sees them right
 *   away).
 * - 500/502/503/504 (server): retryable, so the inner loop retries first; if
 *   retries exhaust, the outer loop failovers.
 * - 429 (rate limit): retry-only. Failover on 429 risks cascading load across
 *   providers; backoff is the proven response.
 * - 408 (timeout): retry-only. Network-level; failover unlikely to help.
 */
export const FAILOVER_ELIGIBLE_STATUS_CODES = new Set([
  401, 403, 500, 502, 503, 504,
])

/**
 * Resolve the ordered list of models to attempt for a request, starting with
 * the primary requested model followed by the configured failover models.
 *
 * The primary model is always first. The failover list is deduped both against
 * the primary AND within itself (preserving first-seen order), so a
 * misconfigured `failoverModels` that repeats the primary or lists a backup
 * multiple times does not cause a redundant same-model attempt. If no failover
 * models are configured, returns a single-element list containing only the
 * primary (or an empty list when `primaryModel` is undefined).
 */
export function resolveModelsToTry(
  primaryModel: string | undefined,
  loadedConfig: LoadedProviderConfig | undefined,
): string[] {
  const failoverModels = loadedConfig?.config?.failoverModels ?? []
  const primary = primaryModel ? [primaryModel] : []
  // Dedupe against the primary AND within failoverModels itself, preserving
  // first-seen order. A misconfigured list with duplicate backups must not
  // cause the loop to wastefully retry the same backup model twice.
  const seen = new Set<string>(primary)
  const dedupedFailovers: string[] = []
  for (const model of failoverModels) {
    if (seen.has(model)) continue
    seen.add(model)
    dedupedFailovers.push(model)
  }
  return [...primary, ...dedupedFailovers]
}

/**
 * Classify whether an error is eligible to trigger failover to the next
 * configured backup provider.
 *
 * Returns true for explicitly classified provider content-policy errors or
 * errors carrying a failover-eligible HTTP status code
 * (401/403/500/502/503/504). Other non-HTTP errors (network blips, aborts,
 * etc.) are handled by the inner retry loop's transient-error path.
 */
export function isFailoverEligibleError(error: unknown): boolean {
  if (isProviderContentPolicyError(error)) return true
  const statusCode = getErrorStatusCode(error)
  if (statusCode === undefined) return false
  return FAILOVER_ELIGIBLE_STATUS_CODES.has(statusCode)
}
