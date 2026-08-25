import {
  extractApiErrorDetails,
  getErrorObject,
  isAbortError,
  isFetchIdleTimeoutError,
  isTransientNetworkError,
} from '@codebuff/common/util/error'

/** One additional full agent-step attempt after the provider's own retries. */
export const MAX_AGENT_STEP_RECOVERY_ATTEMPTS = 1

export type AgentRecoveryKind =
  'network' | 'idle-timeout' | 'rate-limit' | 'server'

export type AgentRecoveryDecision =
  | {
      retryable: true
      kind: AgentRecoveryKind
      statusCode?: number
    }
  | {
      retryable: false
      reason: 'aborted' | 'authentication' | 'client' | 'unknown'
      statusCode?: number
    }

const isRetryableStatusCode = (statusCode: number): boolean =>
  statusCode === 408 ||
  statusCode === 425 ||
  statusCode === 429 ||
  (statusCode >= 500 && statusCode <= 599)

/**
 * Classifies errors that escaped the provider SDK's internal retry loop.
 *
 * Only failures that are safe to repeat without changing the user's request
 * are marked retryable. Abort and authentication failures must reach the
 * normal error path immediately.
 */
export function classifyAgentRecovery(error: unknown): AgentRecoveryDecision {
  if (isAbortError(error)) {
    return { retryable: false, reason: 'aborted' }
  }

  if (isFetchIdleTimeoutError(error)) {
    return { retryable: true, kind: 'idle-timeout' }
  }

  if (isTransientNetworkError(error)) {
    return { retryable: true, kind: 'network' }
  }

  const statusCode = extractApiErrorDetails(error).statusCode
  if (statusCode !== undefined && isRetryableStatusCode(statusCode)) {
    return {
      retryable: true,
      kind: statusCode === 429 ? 'rate-limit' : 'server',
      statusCode,
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return { retryable: false, reason: 'authentication', statusCode }
  }

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return { retryable: false, reason: 'client', statusCode }
  }

  // Some providers mark an error retryable without exposing an HTTP status.
  // Trust that explicit signal, but do not infer retryability from an
  // otherwise unknown error or override a known client/authentication error.
  if (getErrorObject(error).isRetryable === true) {
    return { retryable: true, kind: 'server', statusCode }
  }

  return { retryable: false, reason: 'unknown' }
}

/** Deterministic exponential backoff for the outer recovery attempt. */
export function getAgentRecoveryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt))
  return Math.min(4_000, 500 * 2 ** (normalizedAttempt - 1))
}
