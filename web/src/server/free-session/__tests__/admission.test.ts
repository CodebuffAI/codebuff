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
    isFireworksAdmissible: async () => true,
    getMaxAdmitsPerTick: () => 1,
    getSessionLengthMs: () => 60 * 60 * 1000,
    getSessionGraceMs: () => 30 * 60 * 1000,
    now: () => NOW,
    ...overrides,
  }
}

describe('runAdmissionTick', () => {
  test('admits maxAdmitsPerTick when healthy', async () => {
    const deps = makeAdmissionDeps({ getMaxAdmitsPerTick: () => 2 })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(2)
    expect(result.skipped).toBeNull()
  })

  test('defaults to 1 admit per tick', async () => {
    const deps = makeAdmissionDeps()
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(1)
  })

  test('skips admission when Fireworks not healthy', async () => {
    const deps = makeAdmissionDeps({
      isFireworksAdmissible: async () => false,
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(0)
    expect(result.skipped).toBe('health')
  })

  test('sweeps expired sessions even when skipping admission', async () => {
    let swept = 0
    const deps = makeAdmissionDeps({
      sweepExpired: async () => {
        swept = 3
        return 3
      },
      isFireworksAdmissible: async () => false,
    })
    const result = await runAdmissionTick(deps)
    expect(swept).toBe(3)
    expect(result.expired).toBe(3)
  })

  test('propagates expiry count and admit count together', async () => {
    const deps = makeAdmissionDeps({
      sweepExpired: async () => 2,
      countActive: async () => 5,
    })
    const result = await runAdmissionTick(deps)
    expect(result.expired).toBe(2)
    expect(result.admitted).toBe(1)
  })

  test('forwards grace ms to sweepExpired', async () => {
    const received: number[] = []
    const deps = makeAdmissionDeps({
      getSessionGraceMs: () => 12_345,
      sweepExpired: async (_now, graceMs) => {
        received.push(graceMs)
        return 0
      },
    })
    await runAdmissionTick(deps)
    expect(received).toEqual([12_345])
  })
})
