import { describe, expect, test } from 'bun:test'

import { FREEBUFF_GLM_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { runAdmissionTick } from '../admission'

import type { AdmissionDeps } from '../admission'
import type { FireworksHealth, FleetHealth } from '../fireworks-health'

const NOW = new Date('2026-04-17T12:00:00Z')
const TEST_MODEL = 'test-model'

function makeAdmissionDeps(
  overrides: Partial<AdmissionDeps> = {},
): AdmissionDeps & {
  calls: { admit: number }
} {
  const calls = { admit: 0 }
  const deps: AdmissionDeps & { calls: { admit: number } } = {
    calls,
    sweepExpired: async () => 0,
    evictBanned: async () => 0,
    queueDepth: async () => 0,
    activeCountsByModel: async () => ({}),
    getFleetHealth: async () => ({}),
    admitFromQueue: async ({ health }) => {
      calls.admit += 1
      if (health !== 'healthy') {
        return { admitted: [], skipped: health }
      }
      return { admitted: [{ user_id: 'u0' }], skipped: null }
    },
    sessionLengthMs: 60 * 60 * 1000,
    graceMs: 30 * 60 * 1000,
    now: () => NOW,
    // Default to a single model so per-tick assertions (admitted: 1) stay
    // crisp regardless of how many production models are registered.
    models: [TEST_MODEL],
    ...overrides,
  }
  return deps
}

function fleet(
  health: FireworksHealth,
  model: string = TEST_MODEL,
): FleetHealth {
  return { [model]: health }
}

describe('runAdmissionTick', () => {
  test('admits one user per tick when healthy', async () => {
    const deps = makeAdmissionDeps()
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(1)
    expect(result.skipped).toBeNull()
  })

  test('skips admission when the model deployment is degraded', async () => {
    const deps = makeAdmissionDeps({
      getFleetHealth: async () => fleet('degraded'),
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(0)
    expect(result.skipped).toBe('degraded')
  })

  test('skips admission when the model deployment is unhealthy', async () => {
    const deps = makeAdmissionDeps({
      getFleetHealth: async () => fleet('unhealthy'),
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(0)
    expect(result.skipped).toBe('unhealthy')
  })

  test('sweeps expired sessions even when skipping admission', async () => {
    let swept = 0
    const deps = makeAdmissionDeps({
      sweepExpired: async () => {
        swept = 3
        return 3
      },
      getFleetHealth: async () => fleet('unhealthy'),
    })
    const result = await runAdmissionTick(deps)
    expect(swept).toBe(3)
    expect(result.expired).toBe(3)
  })

  test('admits per-model based on per-deployment health', async () => {
    // Two models: 'good' is healthy, 'bad' is degraded. A single tick should
    // admit 1 from 'good' and skip 'bad', surfacing the worst skip reason.
    const deps = makeAdmissionDeps({
      models: ['good', 'bad'],
      getFleetHealth: async () => ({ good: 'healthy', bad: 'degraded' }),
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(1)
    expect(result.skipped).toBe('degraded')
  })

  test('absent fleet entry defaults to healthy (serverless model)', async () => {
    // Model isn't in the fleet map (e.g. served via Fireworks serverless).
    // Admission should proceed rather than stall waiting for a probe that
    // will never include this deployment.
    const deps = makeAdmissionDeps({
      models: ['serverless-model'],
      getFleetHealth: async () => ({}),
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(1)
    expect(result.skipped).toBeNull()
  })

  test('legacy GLM 5.1 is admitted during deployment hours', async () => {
    const deps = makeAdmissionDeps({
      models: [FREEBUFF_GLM_MODEL_ID],
      now: () => new Date('2026-04-17T16:00:00Z'),
      getFleetHealth: async () => ({ [FREEBUFF_GLM_MODEL_ID]: 'healthy' }),
    })
    const result = await runAdmissionTick(deps)
    expect(result.admitted).toBe(1)
    expect(result.skipped).toBeNull()
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

  test('evicts banned users every tick and surfaces the count', async () => {
    let evictCalls = 0
    const deps = makeAdmissionDeps({
      evictBanned: async () => {
        evictCalls += 1
        return 4
      },
    })
    const result = await runAdmissionTick(deps)
    expect(evictCalls).toBe(1)
    expect(result.evictedBanned).toBe(4)
  })

  test('still evicts banned users when admission is paused by health', async () => {
    let evictCalls = 0
    const deps = makeAdmissionDeps({
      getFleetHealth: async () => fleet('unhealthy'),
      evictBanned: async () => {
        evictCalls += 1
        return 2
      },
    })
    const result = await runAdmissionTick(deps)
    expect(evictCalls).toBe(1)
    expect(result.evictedBanned).toBe(2)
    expect(result.admitted).toBe(0)
    expect(result.skipped).toBe('unhealthy')
  })
})
