import { describe, expect, test } from 'bun:test'

import { runAdmissionTick } from '../admission'

import type { AdmissionDeps } from '../admission'

const NOW = new Date('2026-04-17T12:00:00Z')

function makeAdmissionDeps(overrides: Partial<AdmissionDeps> = {}): AdmissionDeps & {
  calls: { admit: number }
} {
  const calls = { admit: 0 }
  const deps: AdmissionDeps & { calls: { admit: number } } = {
    calls,
    sweepExpired: async () => 0,
    queueDepth: async () => 0,
    isFireworksAdmissible: async () => true,
    admitFromQueue: async ({ isFireworksAdmissible }) => {
      calls.admit += 1
      if (!(await isFireworksAdmissible())) {
        return { admitted: [], skipped: 'health' }
      }
      return { admitted: [{ user_id: 'u0' }], skipped: null }
    },
    sessionLengthMs: 60 * 60 * 1000,
    graceMs: 30 * 60 * 1000,
    now: () => NOW,
    ...overrides,
  }
  return deps
}

describe('runAdmissionTick', () => {
  test('admits one user per tick when healthy', async () => {
    const deps = makeAdmissionDeps()
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(1)
    expect(result.skipped).toBeNull()
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
    })
    const result = await runAdmissionTick(deps)
    expect(result.expired).toBe(2)
    expect(result.admitted).toBe(1)
  })

  test('forwards grace ms to sweepExpired', async () => {
    const received: number[] = []
    const deps = makeAdmissionDeps({
      graceMs: 12_345,
      sweepExpired: async (_now, graceMs) => {
        received.push(graceMs)
        return 0
      },
    })
    await runAdmissionTick(deps)
    expect(received).toEqual([12_345])
  })
})
