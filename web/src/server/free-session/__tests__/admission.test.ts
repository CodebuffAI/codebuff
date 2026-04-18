import { describe, expect, test } from 'bun:test'

import { runAdmissionTick } from '../admission'

import type { AdmissionDeps } from '../admission'

const NOW = new Date('2026-04-17T12:00:00Z')

function makeAdmissionDeps(overrides: Partial<AdmissionDeps> = {}): AdmissionDeps & {
  calls: { admit: number[]; expired: number; active: number }
} {
  const calls = { admit: [] as number[], expired: 0, active: 0 }
  return {
    calls,
    sweepExpired: async () => 0,
    countActive: async () => 0,
    queueDepth: async () => 0,
    admitFromQueue: async ({ limit }) => {
      calls.admit.push(limit)
      return Array.from({ length: limit }, (_, i) => ({ user_id: `u${i}` }))
    },
    isFireworksAdmissible: () => true,
    getMaxConcurrentSessions: () => 10,
    getSessionLengthMs: () => 60 * 60 * 1000,
    now: () => NOW,
    ...overrides,
  }
}

describe('runAdmissionTick', () => {
  test('admits up to (max - active) when healthy', async () => {
    const deps = makeAdmissionDeps({
      countActive: async () => 3,
      getMaxConcurrentSessions: () => 10,
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(7)
    expect(result.skipped).toBeNull()
  })

  test('caps admits per tick at MAX_ADMITS_PER_TICK', async () => {
    const deps = makeAdmissionDeps({
      countActive: async () => 0,
      getMaxConcurrentSessions: () => 1000,
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(20)
  })

  test('skips admission when Fireworks not healthy', async () => {
    const deps = makeAdmissionDeps({
      isFireworksAdmissible: () => false,
      countActive: async () => 0,
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(0)
    expect(result.skipped).toBe('health')
  })

  test('skips when at capacity', async () => {
    const deps = makeAdmissionDeps({
      countActive: async () => 10,
      getMaxConcurrentSessions: () => 10,
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(0)
    expect(result.skipped).toBe('full')
  })

  test('sweeps expired sessions even when skipping admission', async () => {
    let swept = 0
    const deps = makeAdmissionDeps({
      sweepExpired: async () => {
        swept = 3
        return 3
      },
      isFireworksAdmissible: () => false,
    })
    const result = await runAdmissionTick(deps)
    expect(swept).toBe(3)
    expect(result.expired).toBe(3)
  })

  test('propagates expiry count and admit count together', async () => {
    const deps = makeAdmissionDeps({
      sweepExpired: async () => 2,
      countActive: async () => 5,
      getMaxConcurrentSessions: () => 8,
    })
    const result = await runAdmissionTick(deps)
    expect(result.expired).toBe(2)
    expect(result.admitted).toBe(3)
  })
})
