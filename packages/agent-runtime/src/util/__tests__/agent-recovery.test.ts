import { describe, expect, it } from 'bun:test'

import { AbortError } from '@codebuff/common/util/error'

import {
  classifyAgentRecovery,
  getAgentRecoveryDelayMs,
  MAX_AGENT_STEP_RECOVERY_ATTEMPTS,
} from '../agent-recovery'

describe('classifyAgentRecovery', () => {
  it('retries transient network failures', () => {
    const decision = classifyAgentRecovery(
      Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }),
    )

    expect(decision).toEqual({ retryable: true, kind: 'network' })
  })

  it('retries idle timeouts', () => {
    const decision = classifyAgentRecovery(
      Object.assign(new Error('The operation timed out.'), {
        name: 'TimeoutError',
      }),
    )

    expect(decision).toEqual({ retryable: true, kind: 'idle-timeout' })
  })

  it('retries rate limits and server failures', () => {
    expect(
      classifyAgentRecovery(
        Object.assign(new Error('busy'), { statusCode: 429 }),
      ),
    ).toEqual({ retryable: true, kind: 'rate-limit', statusCode: 429 })
    expect(
      classifyAgentRecovery(
        Object.assign(new Error('unavailable'), { status: 503 }),
      ),
    ).toEqual({ retryable: true, kind: 'server', statusCode: 503 })
  })

  it('honors an explicit retryable signal without a status code', () => {
    expect(
      classifyAgentRecovery(
        Object.assign(new Error('provider retry'), { isRetryable: true }),
      ),
    ).toEqual({ retryable: true, kind: 'server' })
  })

  it('does not retry aborts or authentication failures', () => {
    expect(classifyAgentRecovery(new AbortError())).toEqual({
      retryable: false,
      reason: 'aborted',
    })
    expect(
      classifyAgentRecovery(
        Object.assign(new Error('unauthorized'), {
          status: 401,
          isRetryable: true,
        }),
      ),
    ).toEqual({ retryable: false, reason: 'authentication', statusCode: 401 })
  })

  it('does not retry ordinary client errors', () => {
    expect(
      classifyAgentRecovery(
        Object.assign(new Error('bad request'), { statusCode: 400 }),
      ),
    ).toEqual({ retryable: false, reason: 'client', statusCode: 400 })
  })
})

describe('getAgentRecoveryDelayMs', () => {
  it('uses bounded deterministic exponential backoff', () => {
    expect(getAgentRecoveryDelayMs(0)).toBe(500)
    expect(getAgentRecoveryDelayMs(1)).toBe(500)
    expect(getAgentRecoveryDelayMs(2)).toBe(1000)
    expect(getAgentRecoveryDelayMs(20)).toBe(4000)
  })
})

describe('MAX_AGENT_STEP_RECOVERY_ATTEMPTS', () => {
  it('allows two bounded recovery attempts', () => {
    expect(MAX_AGENT_STEP_RECOVERY_ATTEMPTS).toBe(2)
  })
})
